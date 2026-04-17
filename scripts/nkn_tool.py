#!/usr/bin/env python3
import sqlite3
import os
import sys
import json
import argparse
from datetime import datetime
from pathlib import Path

# ==============================================================================
# PATH CONFIGURATION
# ==============================================================================
# We define the home directory (~/) as the base path so that memory is global.
# We create a hidden folder '.ai-toolbox' to avoid cluttering the user's home or workspace.
DB_DIR = Path.home() / ".ai-toolbox"
DB_PATH = DB_DIR / "nkn.db"

def init_db():
    """
    STEP 1: DATABASE INITIALIZATION
    This step ensures the system has a physical location to store knowledge/memories.
    """
    # Create the directory if it doesn't exist (mkdir -p)
    DB_DIR.mkdir(parents=True, exist_ok=True)
    
    # Open (or create) the SQLite database file
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 'decisions' table structure:
    # This is where your project's "DNA" and architectural history are stored.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique identifier
            project TEXT NOT NULL,                -- Current repository name
            topic TEXT,                           -- Category (Architecture, UX, etc.)
            decision TEXT NOT NULL,               -- What was decided
            reasoning TEXT,                       -- The "Why" (the actual learning)
            stack TEXT,                           -- Technologies involved
            tokens_cost INTEGER,                  -- Estimated session cost in tokens
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP -- Record creation date and time
        )
    ''')
    
    # OPTIONAL: Advanced search engine (FTS5).
    # Allows the AI to search through your decisions almost instantaneously.
    try:
        cursor.execute('''
            CREATE VIRTUAL TABLE IF NOT EXISTS decisions_search USING fts5(
                topic, decision, reasoning, stack, tokenize="unicode61"
            )
        ''')
    except sqlite3.OperationalError:
        # If the system doesn't support FTS5, the script will fall back 
        # to conventional pattern matching (LIKE).
        pass
        
    # Save changes and close the connection securely
    conn.commit()
    conn.close()
    print(f"✅ Database initialized safely at {DB_PATH}")

def log_decision(project, topic, decision, reasoning, stack, tokens_cost):
    """
    STEP 2: KNOWLEDGE STORAGE (LEARNING)
    Takes the information "distilled" by the AI and persists it to disk.
    """
    # Connect to the user's personal database file
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Generate the current timestamp for the history record
    timestamp = datetime.now().isoformat()
    
    # Insert the technical decision into the main table
    cursor.execute('''
        INSERT INTO decisions (project, topic, decision, reasoning, stack, tokens_cost, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (project, topic, decision, reasoning, stack, tokens_cost, timestamp))
    
    # If the search engine is active, update the full-text search index
    try:
        cursor.execute('''
            INSERT INTO decisions_search (topic, decision, reasoning, stack)
            VALUES (?, ?, ?, ?)
        ''', (topic, decision, reasoning, stack))
    except sqlite3.OperationalError:
        pass
        
    # Commit: Ensures data is permanently written to disk
    conn.commit()
    conn.close()
    print(f"✅ Knowledge Gem persisted for project: {project}")

def query_knowledge(query_term, project=None):
    """
    STEP 3: KNOWLEDGE RETRIEVAL (RECALL)
    Searches the history of decisions to inject context into the current AI session.
    """
    # Security: If no database exists, return an empty list
    if not DB_PATH.exists():
        return []

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row # Allows accessing columns by name
    cursor = conn.cursor()
    
    results = []
    
    # Attempt to use the fast search engine (FTS5)
    try:
        sql = "SELECT * FROM decisions_search WHERE decisions_search MATCH ? LIMIT 10"
        cursor.execute(sql, (query_term,))
        search_results = cursor.fetchall()
        results = [dict(row) for row in search_results]
    except (sqlite3.OperationalError, sqlite3.ProgrammingError):
        # Fallback: Use conventional pattern matching if FTS5 is unavailable
        sql = "SELECT * FROM decisions WHERE decision LIKE ? OR topic LIKE ? OR reasoning LIKE ? LIMIT 10"
        term = f"%{query_term}%"
        cursor.execute(sql, (term, term, term))
        search_results = cursor.fetchall()
        results = [dict(row) for row in search_results]

    conn.close()
    return results

def main():
    """
    MAIN ENTRY POINT (CLI)
    Manages commands executed by the AI or the user from the terminal.
    """
    parser = argparse.ArgumentParser(description="NKN: Neural Knowledge Network Tool")
    subparsers = parser.add_subparsers(dest="command")
    
    # 'init' command: Prepares the local environment and database
    subparsers.add_parser("init")
    
    # 'log' command: Stores a new "knowledge neuron"
    log_parser = subparsers.add_parser("log")
    log_parser.add_argument("--project", required=True)
    log_parser.add_argument("--topic", default="General")
    log_parser.add_argument("--decision", required=True)
    log_parser.add_argument("--reasoning", default="")
    log_parser.add_argument("--stack", default="")
    log_parser.add_argument("--tokens-cost", type=int, default=0)
    
    # 'query' command: Searches through the user's stored memories
    query_parser = subparsers.add_parser("query")
    query_parser.add_argument("--term", required=True)
    query_parser.add_argument("--project", help="Filter by project")
    
    args = parser.parse_args()
    
    # Execute logic based on the detected command
    if args.command == "init":
        init_db()
    elif args.command == "log":
        # Store technical decision
        log_decision(args.project, args.topic, args.decision, args.reasoning, args.stack, args.tokens_cost)
    elif args.command == "query":
        # Retrieve relevant information and return it in JSON format for the AI
        results = query_knowledge(args.term, args.project)
        if not results:
            print(json.dumps({"status": "no_results", "message": "No relevant memories found."}))
        else:
            print(json.dumps({"status": "success", "data": results}, indent=2))
    else:
        # If no command is provided, show help
        parser.print_help()

if __name__ == "__main__":
    main()
