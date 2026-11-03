import { randomUUID } from 'node:crypto';
import { query } from '../db/postgres.js';

// Чат «пользователь ↔ администратор». Одна беседа на пользователя (ключ — userSub).
// sender: 'user' | 'admin'. Флаги прочтения — для счётчиков непрочитанного.

function rowTo(r) {
  if (!r) return null;
  return {
    id: r.id,
    userSub: r.user_sub,
    userName: r.user_name,
    userEmail: r.user_email,
    sender: r.sender,
    text: r.text,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

class ChatStore {
  async add({ userSub, userName, userEmail, sender, text }) {
    const rec = {
      id: randomUUID(),
      userSub,
      userName: userName || null,
      userEmail: userEmail || null,
      sender,
      text,
      createdAt: new Date().toISOString(),
      readByAdmin: sender === 'admin' ? true : false,
      readByUser: sender === 'user' ? true : false,
    };
    await query(
      'INSERT INTO chat_messages (id, user_sub, user_name, user_email, sender, text, created_at, read_by_admin, read_by_user) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [rec.id, rec.userSub, rec.userName, rec.userEmail, rec.sender, rec.text, rec.createdAt, rec.readByAdmin, rec.readByUser],
    );
    return rowTo({ ...rec, user_sub: rec.userSub, user_name: rec.userName, user_email: rec.userEmail, created_at: rec.createdAt });
  }

  async listByUser(userSub) {
    const { rows } = await query('SELECT * FROM chat_messages WHERE user_sub = $1 ORDER BY created_at ASC', [userSub]);
    return rows.map(rowTo);
  }

  async deleteByUser(userSub) {
    await query('DELETE FROM chat_messages WHERE user_sub = $1', [userSub]);
  }

  async markReadByAdmin(userSub) {
    await query("UPDATE chat_messages SET read_by_admin = TRUE WHERE user_sub = $1 AND sender = 'user'", [userSub]);
  }

  async markReadByUser(userSub) {
    await query("UPDATE chat_messages SET read_by_user = TRUE WHERE user_sub = $1 AND sender = 'admin'", [userSub]);
  }

  // Непрочитанные админом сообщения от пользователя (для бейджа админки).
  async unreadForAdmin() {
    const { rows } = await query("SELECT COUNT(*) c FROM chat_messages WHERE sender = 'user' AND read_by_admin = FALSE");
    return parseInt(rows[0].c, 10);
  }

  // Непрочитанные пользователем ответы админа (для бейджа плавающей кнопки).
  async unreadForUser(userSub) {
    const { rows } = await query("SELECT COUNT(*) c FROM chat_messages WHERE user_sub = $1 AND sender = 'admin' AND read_by_user = FALSE", [userSub]);
    return parseInt(rows[0].c, 10);
  }

  // Список бесед для админа (как в мессенджере): последняя реплика + непрочитанные.
  async listConversations() {
    const { rows } = await query(`
      SELECT user_sub,
             MAX(user_name)  AS user_name,
             MAX(user_email) AS user_email,
             MAX(created_at) AS last_at,
             SUM(CASE WHEN sender = 'user' AND read_by_admin = FALSE THEN 1 ELSE 0 END) AS unread,
             COUNT(*) AS total
      FROM chat_messages
      GROUP BY user_sub
      ORDER BY last_at DESC
    `);
    const conversations = [];
    for (const r of rows) {
      const { rows: lastRows } = await query('SELECT text, sender FROM chat_messages WHERE user_sub = $1 ORDER BY created_at DESC LIMIT 1', [r.user_sub]);
      const last = lastRows[0];
      conversations.push({
        userSub: r.user_sub,
        userName: r.user_name,
        userEmail: r.user_email,
        lastAt: new Date(r.last_at).toISOString(),
        lastText: last?.text || '',
        lastSender: last?.sender || '',
        unread: parseInt(r.unread, 10),
        total: parseInt(r.total, 10),
      });
    }
    return conversations;
  }
}

export const chatStore = new ChatStore();
