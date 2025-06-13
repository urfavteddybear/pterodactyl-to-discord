import { GuildMember, User } from 'discord.js';
import { DatabaseConnection } from '../database/connection';
import { BoundUser, CommandContext } from '../types';

export class AuthService {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  async isUserBound(discordId: string): Promise<boolean> {
    const user = this.db.getBoundUser(discordId);
    return !!user;
  }
  async getBoundUser(discordId: string): Promise<BoundUser | null> {
    return this.db.getBoundUser(discordId);
  }

  async isPterodactylUserBound(pterodactylUserId: number): Promise<{ isBound: boolean; discordId?: string }> {
    const existingBinding = this.db.getPterodactylUserBinding(pterodactylUserId);
    if (existingBinding) {
      return { isBound: true, discordId: existingBinding.discord_id };
    }
    return { isBound: false };
  }

  async bindUser(discordId: string, pterodactylUserId: number, apiKey: string): Promise<void> {
    this.db.bindUser(discordId, pterodactylUserId, apiKey);
  }

  async unbindUser(discordId: string): Promise<void> {
    this.db.unbindUser(discordId);
  }

  isAdmin(member: GuildMember): boolean {
    const adminRoleId = process.env.ADMIN_ROLE_ID;
    if (!adminRoleId) return false;
    
    return member.roles.cache.has(adminRoleId) || member.permissions.has('Administrator');
  }

  async createCommandContext(user: User, member?: GuildMember): Promise<CommandContext | null> {
    const boundUser = await this.getBoundUser(user.id);
    if (!boundUser) return null;

    return {
      user: boundUser,
      isAdmin: member ? this.isAdmin(member) : false,
    };
  }

  async requireAuth(user: User, member?: GuildMember): Promise<CommandContext> {
    const context = await this.createCommandContext(user, member);
    if (!context) {
      throw new Error('You must bind your account first! Use `/bind` command.');
    }
    return context;
  }

  async requireAdmin(user: User, member: GuildMember): Promise<CommandContext> {
    const context = await this.requireAuth(user, member);
    if (!context.isAdmin) {
      throw new Error('You must be an administrator to use this command.');
    }
    return context;
  }
}
