import axios, { AxiosInstance } from 'axios';
import { PterodactylServer, PterodactylUser, ServerCreationOptions } from '../types';

export class PterodactylService {
  private client: AxiosInstance;
  private userClient: AxiosInstance | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: `${process.env.PTERODACTYL_URL}/api/application`,
      headers: {
        'Authorization': `Bearer ${process.env.PTERODACTYL_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
  }

  // Set user-specific API key for operations
  setUserApiKey(apiKey: string): void {
    this.userClient = axios.create({
      baseURL: `${process.env.PTERODACTYL_URL}/api/client`,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  // Set admin API key for operations (revert to admin client)
  setAdminApiKey(): void {
    this.client = axios.create({
      baseURL: `${process.env.PTERODACTYL_URL}/api/application`,
      headers: {
        'Authorization': `Bearer ${process.env.PTERODACTYL_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
  }

  private getSmartStartupCommand(egg: any): string {
    const eggName = egg.name?.toLowerCase() || '';
    const nestName = egg.nest_name?.toLowerCase() || '';
    
    // Smart defaults based on egg type
    if (eggName.includes('node') || eggName.includes('nodejs')) {
      return 'node index.js';
    }
    
    if (eggName.includes('python')) {
      return 'python main.py';
    }
    
    if (eggName.includes('java') || eggName.includes('jar')) {
      return 'java -jar server.jar';
    }
    
    if (eggName.includes('go') || eggName.includes('golang')) {
      return './main';
    }
    
    if (eggName.includes('rust')) {
      return './target/release/server';
    }
    
    if (eggName.includes('docker') || eggName.includes('generic')) {
      return './start.sh';
    }
    
    // Generic AIO (All-in-One) eggs - common for custom deployments
    if (eggName.includes('aio') || eggName.includes('pterodactyl')) {
      return 'bash';
    }
    
    // Fallback based on nest type
    if (nestName.includes('minecraft')) {
      return 'java -Xmx1024M -Xms1024M -jar server.jar nogui';
    }
    
    // Generic fallback
    return 'echo "Server configured with smart defaults"';
  }

  // Admin operations (using admin API key)
  async getUsers(): Promise<PterodactylUser[]> {
    try {
      const response = await this.client.get('/users');
      return response.data.data.map((user: any) => user.attributes);
    } catch (error) {
      throw new Error(`Failed to fetch users: ${error}`);
    }
  }

  async getUserById(userId: number): Promise<PterodactylUser> {
    try {
      const response = await this.client.get(`/users/${userId}`);
      return response.data.attributes;
    } catch (error) {
      throw new Error(`Failed to fetch user: ${error}`);
    }
  }

  async createUser(userData: {
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    password: string;
  }): Promise<PterodactylUser> {
    try {
      const response = await this.client.post('/users', userData);
      return response.data.attributes;
    } catch (error) {
      throw new Error(`Failed to create user: ${error}`);
    }
  }

  async getNodes(): Promise<any[]> {
    try {
      const response = await this.client.get('/nodes');      // Filter out undefined/incomplete nodes
      const nodes = response.data.data
        .map((node: any) => node.attributes)
        .filter((node: any) => node && node.id && node.name);
      
      return nodes;
    } catch (error) {
      console.error('Failed to fetch nodes:', error);
      throw new Error(`Failed to fetch nodes: ${error}`);
    }
  }

  async getNodeAllocations(nodeId: number): Promise<any[]> {
    try {
      const response = await this.client.get(`/nodes/${nodeId}/allocations`);
      return response.data.data;
    } catch (error) {
      console.error(`Failed to fetch allocations for node ${nodeId}:`, error);
      throw new Error(`Failed to fetch allocations: ${error}`);
    }
  }

  async getEggs(): Promise<any[]> {
    try {
      // First get all nests
      const nestsResponse = await this.client.get('/nests');
      const nests = nestsResponse.data.data;
      
      const allEggs: any[] = [];
      
      // Get eggs from each nest
      for (const nest of nests) {
        try {
          const eggsResponse = await this.client.get(`/nests/${nest.attributes.id}/eggs`);
          const eggs = eggsResponse.data.data.map((egg: any) => ({
            ...egg.attributes,
            nest_name: nest.attributes.name,
            nest_id: nest.attributes.id
          }));
          allEggs.push(...eggs);
        } catch (error) {
          console.warn(`Failed to fetch eggs for nest ${nest.attributes.name}:`, error);
        }
      }
        // Filter out undefined/incomplete eggs
      const validEggs = allEggs.filter(egg => egg && egg.id && egg.name);
      
      return validEggs;
    } catch (error) {
      throw new Error(`Failed to fetch eggs: ${error}`);
    }
  }

  async createServer(options: ServerCreationOptions & { user: number }): Promise<PterodactylServer> {
    try {
      // Get the selected egg details for proper configuration
      const eggs = await this.getEggs();
      const selectedEgg = eggs.find(egg => egg.id === options.egg);
      
      if (!selectedEgg) {
        throw new Error(`Egg with ID ${options.egg} not found`);
      }      // Basic server creation payload according to Pterodactyl API
      const serverData = {
        name: options.name,
        description: options.description || '',
        user: options.user,
        egg: options.egg,
        docker_image: selectedEgg.docker_image || 'ghcr.io/pterodactyl/yolks:java_17',
        startup: selectedEgg.startup || 'echo "Starting server..."',
        limits: {
          memory: options.memory,
          swap: 0,
          disk: options.disk,
          io: 500,
          cpu: options.cpu,
        },
        feature_limits: {
          databases: 0,
          backups: 1,
          allocations: 1,
        },
        deploy: {
          locations: [options.location || 1],
          dedicated_ip: false,
          port_range: [],
        },
        environment: {
          // Use egg's default environment variables if they exist
          ...(selectedEgg.environment || {}),
          
          // Smart defaults for eggs with {{STARTUP_CMD}} placeholder
          ...(selectedEgg.startup?.includes('{{STARTUP_CMD}}') && {
            STARTUP_CMD: this.getSmartStartupCommand(selectedEgg)
          }),
          
          // Add Paper-specific variables
          ...(selectedEgg.name?.toLowerCase().includes('paper') && {
            SERVER_JARFILE: 'server.jar',
            BUILD_NUMBER: 'latest'
          }),
          
          // Add Minecraft-specific variables
          ...(selectedEgg.nest_name?.toLowerCase().includes('minecraft') && !selectedEgg.name?.toLowerCase().includes('paper') && {
            SERVER_JARFILE: 'server.jar'
          })
        }
      };      const response = await this.client.post('/servers', serverData);
      return response.data.attributes;
    } catch (error: any) {
      console.error('Server creation failed:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });

      if (error.response?.status === 422) {
        const validationErrors = error.response?.data?.errors;
        
        if (validationErrors) {
          if (Array.isArray(validationErrors)) {
            const errorMessages = validationErrors.map((err, index) => {
              if (typeof err === 'object' && err.detail) {
                return err.detail;
              }
              return `Error ${index + 1}: ${JSON.stringify(err)}`;
            }).join('; ');
            throw new Error(`Validation failed: ${errorMessages}`);
          } else {
            const errorMessages = Object.entries(validationErrors)
              .map(([field, messages]: [string, any]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
              .join('; ');
            throw new Error(`Validation failed: ${errorMessages}`);
          }
        }
        throw new Error('Server creation failed: Invalid data provided');
      }
      
      throw new Error(`Failed to create server: ${error.response?.statusText || error.message}`);
    }
  }

  // User operations (using user-specific API key)
  async getClientUserInfo(): Promise<any> {
    if (!this.userClient) {
      throw new Error('User API key not set');
    }

    try {
      const response = await this.userClient.get('/account');
      
      if (response.data?.attributes) {
        return response.data.attributes;
      } else if (response.data) {
        return response.data;
      } else {
        throw new Error('Unexpected response structure from Pterodactyl API');
      }
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Invalid API key - The provided API key is not valid or has been revoked.');
      } else if (error.response?.status === 404) {
        throw new Error('API endpoint not found - Please check your Pterodactyl panel URL.');
      } else if (error.response?.status === 403) {
        throw new Error('Access forbidden - The API key may not have sufficient permissions');
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('Connection refused - Cannot connect to Pterodactyl panel.');
      } else if (error.code === 'ENOTFOUND') {
        throw new Error('Domain not found - The Pterodactyl panel URL appears to be invalid');
      }
      
      throw new Error(`Failed to fetch user info: ${error.response?.status} ${error.response?.statusText || error.message}`);
    }
  }
  async getUserServers(): Promise<PterodactylServer[]> {
    if (!this.userClient) {
      throw new Error('User API key not set');
    }

    try {
      const response = await this.userClient.get('/');
      const servers = response.data.data.map((server: any) => server.attributes);
      
      // Fetch additional details for each server to get status
      const detailedServers = await Promise.all(
        servers.map(async (server: any) => {
          try {
            const resourceResponse = await this.userClient!.get(`/servers/${server.identifier}/resources`);
            const resourceData = resourceResponse.data.attributes;
            
            return {
              ...server,
              status: resourceData.current_state || 'offline'
            };
          } catch (error) {
            console.error(`Failed to fetch status for server ${server.identifier}:`, error);
            return {
              ...server,
              status: 'unknown'
            };
          }
        })
      );
      
      return detailedServers;
    } catch (error) {
      throw new Error(`Failed to fetch user servers: ${error}`);
    }
  }

  async getServerDetails(serverId: string): Promise<PterodactylServer> {
    if (!this.userClient) {
      throw new Error('User API key not set');
    }

    try {
      const response = await this.userClient.get(`/servers/${serverId}`);
      return response.data.attributes;
    } catch (error) {
      throw new Error(`Failed to fetch server details: ${error}`);
    }
  }
  async deleteServer(serverIdentifier: string): Promise<void> {
    try {
      // First, try to get all servers to find the server by UUID
      const servers = await this.getAllServers();
      const server = servers.find(s => s.uuid === serverIdentifier || s.id?.toString() === serverIdentifier);
      
      if (!server) {
        throw new Error(`Server with identifier ${serverIdentifier} not found`);
      }
        // Use the internal server ID for deletion (Pterodactyl admin API expects internal ID)
      await this.client.delete(`/servers/${server.id}`);
      
    } catch (error) {
      console.error('Server deletion error:', error);
      throw new Error(`Failed to delete server: ${error}`);
    }
  }

  async getAllServers(): Promise<any[]> {
    try {
      const response = await this.client.get('/servers');
      return response.data.data.map((server: any) => server.attributes);
    } catch (error) {
      throw new Error(`Failed to fetch all servers: ${error}`);
    }
  }

  async suspendServer(serverId: string): Promise<void> {
    try {
      await this.client.post(`/servers/${serverId}/suspend`);
    } catch (error) {
      throw new Error(`Failed to suspend server: ${error}`);
    }
  }

  async unsuspendServer(serverId: string): Promise<void> {
    try {
      await this.client.post(`/servers/${serverId}/unsuspend`);
    } catch (error) {
      throw new Error(`Failed to unsuspend server: ${error}`);
    }
  }

  async sendPowerAction(serverId: string, action: 'start' | 'stop' | 'restart' | 'kill'): Promise<void> {
    if (!this.userClient) {
      throw new Error('User API key not set');
    }

    try {
      await this.userClient.post(`/servers/${serverId}/power`, { signal: action });
    } catch (error) {
      throw new Error(`Failed to send power action: ${error}`);
    }
  }

  async userOwnsServer(serverId: string): Promise<boolean> {
    if (!this.userClient) {
      return false;
    }

    try {
      const userServers = await this.getUserServers();
      return userServers.some(server => server.uuid === serverId || server.id?.toString() === serverId);
    } catch (error) {
      console.error('Error checking server ownership:', error);
      return false;
    }
  }

  async getUserServerById(serverId: string): Promise<PterodactylServer | null> {
    if (!this.userClient) {
      throw new Error('User API key not set');
    }

    try {
      const userServers = await this.getUserServers();
      const server = userServers.find(s => s.uuid === serverId || s.id?.toString() === serverId);
      
      if (!server) {
        return null;
      }

      return server;
    } catch (error) {
      throw new Error(`Failed to fetch server: ${error}`);
    }
  }
}
