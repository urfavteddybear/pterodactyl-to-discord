import Database from 'better-sqlite3';

export class DatabaseConnection {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const databasePath = dbPath || process.env.DATABASE_PATH || './database.sqlite';
    this.db = new Database(databasePath);
    this.initializeTables();
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bound_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT UNIQUE NOT NULL,
        pterodactyl_user_id INTEGER NOT NULL,
        pterodactyl_api_key TEXT NOT NULL,
        bound_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT NOT NULL,
        server_uuid TEXT NOT NULL,
        server_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (discord_id) REFERENCES bound_users (discord_id)
      )
    `);
  }

  bindUser(discordId: string, pterodactylUserId: number, apiKey: string): void {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO bound_users (discord_id, pterodactyl_user_id, pterodactyl_api_key) VALUES (?, ?, ?)');
    stmt.run(discordId, pterodactylUserId, apiKey);
  }

  getBoundUser(discordId: string): any {
    const stmt = this.db.prepare('SELECT * FROM bound_users WHERE discord_id = ?');
    return stmt.get(discordId);
  }  unbindUser(discordId: string): void {
    // Use a transaction to ensure both operations succeed or fail together
    const transaction = this.db.transaction((discordId: string) => {
      // Delete dependent records first (user_servers), then the main record (bound_users)
      const stmt1 = this.db.prepare('DELETE FROM user_servers WHERE discord_id = ?');
      const stmt2 = this.db.prepare('DELETE FROM bound_users WHERE discord_id = ?');
      stmt1.run(discordId);
      stmt2.run(discordId);
    });
    
    transaction(discordId);
  }

  addUserServer(discordId: string, serverUuid: string, serverName: string): void {
    const stmt = this.db.prepare('INSERT INTO user_servers (discord_id, server_uuid, server_name) VALUES (?, ?, ?)');
    stmt.run(discordId, serverUuid, serverName);
  }

  removeUserServer(discordId: string, serverUuid: string): void {
    const stmt = this.db.prepare('DELETE FROM user_servers WHERE discord_id = ? AND server_uuid = ?');
    stmt.run(discordId, serverUuid);
  }

  getUserServers(discordId: string): any[] {
    const stmt = this.db.prepare('SELECT * FROM user_servers WHERE discord_id = ?');
    return stmt.all(discordId);
  }

  close(): void {
    this.db.close();
  }
}