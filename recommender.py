"""Қазақ кітаптарының мазмұнға негізделген ұсыныс жүйесі: TF-IDF + косинустық ұқсастық.

Идея: әр кітаптың сипаттамасы TF-IDF векторына айналады. Оқырман профилі =
оған ұнаған кітаптар векторларының орташасы. Профильге векторы ең жақын,
әлі оқылмаған кітаптарды ұсынамыз.

Қазақ тілі жалғамалы (жұрнақ көп), сондықтан әдепкі бойынша символдық
n-граммалар (char_wb, 2-5) қолданылады: «батырдың», «батыр», «батырлар»
сөздері стеммерсіз-ақ ортақ белгілерге ие болады.
"""
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

LIKE_THRESHOLD = 4  # бағасы >= 4 болса, «ұнады» деп санаймыз


def make_vectorizer(kind="char", max_df=1.0):
    if kind == "char":
        return TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), lowercase=True, sublinear_tf=True, max_df=max_df)
    if kind == "word":
        return TfidfVectorizer(analyzer="word", lowercase=True, sublinear_tf=True, max_df=max_df)
    raise ValueError("kind 'char' немесе 'word' болуы керек")


class BookRecommender:
    def __init__(self, books: pd.DataFrame, kind: str = "char", use_genre: bool = True,
                 use_description: bool = False, max_df: float = 1.0):
        self.books = books.reset_index(drop=True)
        self.vec = make_vectorizer(kind, max_df)
        # use_description=False әдепкі: жалпылама сипаттамалар ұсыныс сапасын төмендетті (evaluate.py)
        # сөздікті тек каталог мәтініне үйретеміз, оқырман бағалары қолданылмайды
        desc = self.books["description"].fillna("") if (use_description and "description" in self.books) else ""
        parts = self.books.title + ". " + self.books.author + ". " + desc
        if use_genre:  # каталог метадеректеріндегі жанр мәтінге сөз ретінде қосылады
            parts = parts + " " + self.books.genre.str.replace("_", " ")
        text = parts.tolist()
        self.X = self.vec.fit_transform(text)
        self.id_to_idx = {b: i for i, b in enumerate(self.books.book_id)}

    def scores(self, liked_ids):
        idx = [self.id_to_idx[b] for b in liked_ids if b in self.id_to_idx]
        if not idx:
            raise ValueError("Кемінде бір ұнаған кітап қажет")
        profile = np.asarray(self.X[idx].mean(axis=0))
        return cosine_similarity(profile, self.X).ravel()

    def recommend(self, liked_ids, k=5, exclude_ids=()):
        s = self.scores(liked_ids)
        banned = {self.id_to_idx[b] for b in set(liked_ids) | set(exclude_ids) if b in self.id_to_idx}
        order = [i for i in np.argsort(-s) if i not in banned][:k]
        out = self.books.iloc[order].copy()
        out["similarity"] = s[order]
        return out

    def similar_terms(self, liked_ids, book_id, n=5):
        """Ұсынысты түсіндіретін n-граммалар/сөздер (пайдаланушыға түсініктеме үшін)."""
        idx = [self.id_to_idx[b] for b in liked_ids]
        prof = np.asarray(self.X[idx].mean(axis=0)).ravel()
        vec = self.X[self.id_to_idx[book_id]].toarray().ravel()
        contrib = prof * vec
        names = np.array(self.vec.get_feature_names_out())
        top = np.argsort(-contrib)[: n * 4]
        terms = [t.strip() for t in names[top] if len(t.strip()) >= 4]
        return terms[:n]
