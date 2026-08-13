import sqlite3

c = sqlite3.connect(r"C:\Users\M\.cc-switch\cc-switch.db")
c.row_factory = sqlite3.Row
print("=== TABLES ===")
for r in c.execute("select name from sqlite_master where type='table' order by name").fetchall():
    print(r["name"])
