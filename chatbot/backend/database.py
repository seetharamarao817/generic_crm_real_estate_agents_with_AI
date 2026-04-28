import sqlite3
import os
import uuid
import datetime

DB_PATH = os.environ.get("SQLITE_DB_PATH", "./chatbot.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    with conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                role TEXT,
                content TEXT,
                tokens_used INTEGER DEFAULT 0,
                time_taken REAL DEFAULT 0.0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions (id)
            )
        ''')
        # DB Migration for existing table
        try:
            conn.execute('ALTER TABLE messages ADD COLUMN provider TEXT DEFAULT "system"')
        except sqlite3.OperationalError:
            pass # Column already exists
    conn.close()

def create_session(title="New Chat"):
    session_id = str(uuid.uuid4())
    conn = get_db()
    with conn:
        conn.execute(
            'INSERT INTO sessions (id, title) VALUES (?, ?)',
            (session_id, title)
        )
    conn.close()
    return session_id

def get_all_sessions():
    conn = get_db()
    sessions = conn.execute('SELECT * FROM sessions ORDER BY created_at DESC').fetchall()
    conn.close()
    return [dict(s) for s in sessions]

def get_session_history(session_id):
    conn = get_db()
    messages = conn.execute('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC', (session_id,)).fetchall()
    conn.close()
    return [dict(m) for m in messages]

def save_message(session_id, role, content, tokens_used=0, time_taken=0.0, provider="user"):
    msg_id = str(uuid.uuid4())
    conn = get_db()
    with conn:
        conn.execute(
            'INSERT INTO messages (id, session_id, role, content, tokens_used, time_taken, provider) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (msg_id, session_id, role, content, tokens_used, time_taken, provider)
        )
    conn.close()
    return msg_id

def update_session_title(session_id, title):
    conn = get_db()
    with conn:
        conn.execute(
            'UPDATE sessions SET title = ? WHERE id = ?',
            (title, session_id)
        )
    conn.close()
