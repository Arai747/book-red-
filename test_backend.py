from pathlib import Path
import json
import sys
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend import database as db
from backend.service import BookRecService


@pytest.fixture
def service(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "independent-bookrec.db")
    monkeypatch.setattr(db, "get_database_url", lambda: "")
    return BookRecService(json.loads((ROOT / "frontend/assets/books.json").read_text()))


def test_sqlite_status_and_recommendation_integration(service):
    reader = "a" * 32
    db.register_access_code(reader)
    service.save(reader, [17, 1], {"17": "reading", "1": "finished"})
    state = service.state(reader)
    assert set(state["favorites"]) == {1, 17}
    assert state["statuses"] == {"17": "reading", "1": "finished"}
    assert len(state["recommendations"]) == 12
    assert not {x["book_id"] for x in state["recommendations"]} & {1, 17}
    assert all(0 <= x["score"] <= 1 for x in state["recommendations"])
    assert db.get_preferences(reader) == [1, 17]
    service.save(reader, [], {})
    assert service.state(reader)["favorites"] == []
    assert service.state(reader)["recommendations"] == []


def test_separate_readers_and_snapshot_restore(service):
    alice, bob = "a" * 32, "b" * 32
    service.restore(alice, {"favorites": [17], "statuses": {"17": "reading"}})
    service.restore(bob, {"favorites": [104], "statuses": {}})
    assert service.state(alice)["favorites"] == [17]
    assert service.state(bob)["favorites"] == [104]
    service.restore(alice, {"favorites": [], "statuses": {}})
    assert service.state(alice)["statuses"]["17"] == "reading"


def test_invalid_snapshots_do_not_modify_saved_data(service):
    reader = "a" * 32
    service.restore(reader, {"favorites": [17], "statuses": {}})
    for favorites, statuses in [([99999], {}), ([True], {}), ([17], {"17": "bad"})]:
        with pytest.raises(ValueError):
            service.save(reader, favorites, statuses)
    assert service.state(reader)["favorites"] == [17]
    with pytest.raises(ValueError):
        service.restore("not-a-reader-code", {})


def test_all_270_books_have_local_cover_art():
    records = json.loads((ROOT / "frontend/assets/books.json").read_text())
    assert len(records) == 270
    featured = {1, 17, 104, 210}
    positions = set()
    for book in records:
        if book["book_id"] in featured:
            assert (ROOT / "frontend/assets/covers.png").is_file()
            continue
        index = book["book_id"] - 1 - sum(i < book["book_id"] for i in featured)
        sheet, cell = divmod(index, 16)
        assert (ROOT / "frontend/assets/covers" / f"sheet-{sheet+1:02}.webp").is_file()
        positions.add((sheet, cell))
    assert len(positions) == 266


def test_streamlit_entrypoint(service):
    from streamlit.testing.v1 import AppTest
    app = AppTest.from_file(str(ROOT / "app.py"), default_timeout=40).run()
    assert not app.exception
