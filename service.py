"""Connect the original BookRec interface to SQLite and the Python ML model."""
import re
import pandas as pd
from . import database as db
from .recommender import BookRecommender


class BookRecService:
    def __init__(self, records):
        self.records = records
        self.books = pd.DataFrame(records)
        self.ids = set(self.books.book_id.astype(int))
        self.model = BookRecommender(self.books, use_description=False)
        db.init_db()

    def save(self, reader, favorites, statuses):
        if not isinstance(favorites, list) or any(type(bid) is not int for bid in favorites):
            raise ValueError("Кітап таңдауы дұрыс емес")
        ids = list(dict.fromkeys(favorites))
        if not set(ids).issubset(self.ids) or not isinstance(statuses, dict):
            raise ValueError("Каталогта жоқ кітап таңдалған")
        clean = {bid: statuses.get(str(bid), "planned") for bid in ids}
        if any(status not in db.READING_STATUSES for status in clean.values()):
            raise ValueError("Оқу мәртебесі дұрыс емес")
        with db.get_connection() as conn:
            marker = "%s" if db.is_postgres() else "?"
            if ids:
                placeholders = ",".join(marker for _ in ids)
                conn.execute(f"DELETE FROM reading_list WHERE user_id = {marker} AND book_id NOT IN ({placeholders})", (reader, *ids))
            else:
                conn.execute(f"DELETE FROM reading_list WHERE user_id = {marker}", (reader,))
            for bid in ids:
                conn.execute(
                    f"INSERT INTO reading_list(user_id,book_id,status) VALUES ({marker},{marker},{marker}) ON CONFLICT(user_id,book_id) DO UPDATE SET status=excluded.status",
                    (reader, bid, clean[bid]),
                )
        db.save_preferences(reader, ids)

    def restore(self, reader, backup):
        if not isinstance(reader, str) or not re.fullmatch(r"[0-9a-f]{32}", reader):
            raise ValueError("Оқырман коды дұрыс емес")
        existed = db.access_code_exists(reader)
        db.register_access_code(reader)
        if not existed and isinstance(backup, dict):
            self.save(reader, backup.get("favorites", []), backup.get("statuses", {}))
        return reader

    def state(self, reader):
        favorites = [bid for bid in db.get_reading_list(reader) if bid in self.ids]
        entries = db.get_reading_entries(reader)
        statuses = {str(entry["book_id"]): entry["status"] for entry in entries}
        ranked = self.model.recommend(favorites, k=12) if favorites else self.books.head(0).assign(similarity=0.0)
        return {
            "reader": reader,
            "favorites": favorites,
            "statuses": statuses,
            "recommendations": [{"book_id": int(row.book_id), "score": float(row.similarity)} for row in ranked.itertuples()],
        }
