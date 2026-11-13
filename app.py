"""BookRec: upload app.py, requirements.txt and bookrec_bundle.zip together."""
from pathlib import Path
import hashlib
import json
import os
import secrets
import sys
import tempfile
import zipfile
import streamlit as st
import streamlit.components.v1 as components

UPLOAD_DIR = Path(__file__).resolve().parent
st.set_page_config(page_title="BookRec — Қазақ әдебиеті", page_icon="📚", layout="wide", initial_sidebar_state="collapsed")

@st.cache_resource
def unpack_project():
    bundle = UPLOAD_DIR / "bookrec_bundle.zip"
    if not bundle.is_file():
        raise FileNotFoundError("bookrec_bundle.zip файлын app.py жанына жүктеңіз. Ішкі архивті ашудың қажеті жоқ.")
    fingerprint = hashlib.sha256(bundle.read_bytes()).hexdigest()
    if fingerprint != "dad90ff50ca0ecb9376aabcf7bc0b3d0f83dbf8f115b902f800decd5d797f605":
        raise ValueError("bookrec_bundle.zip толық жүктелмеген немесе басқа нұсқадан алынған. Үш файлды бірге жаңартыңыз.")
    target = Path(tempfile.gettempdir()) / ("bookrec-runtime-" + fingerprint[:20])
    marker = target / ".complete"
    if not marker.is_file():
        target.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(bundle) as archive:
            for entry in archive.infolist():
                destination = (target / entry.filename).resolve()
                if not destination.is_relative_to(target.resolve()):raise ValueError("Архив құрылымы дұрыс емес")
            archive.extractall(target)
        marker.write_text(fingerprint)
    return target

try:
    ROOT = unpack_project()
except (FileNotFoundError, ValueError, zipfile.BadZipFile) as error:
    st.error(str(error));st.stop()

sys.path.insert(0, str(ROOT))
data_key = hashlib.sha256(str(UPLOAD_DIR).encode()).hexdigest()[:16]
os.environ.setdefault("BOOKREC_DB_PATH", str(Path(tempfile.gettempdir()) / "bookrec-data" / data_key / "bookrec.db"))
from backend import database as db
from backend.service import BookRecService

st.markdown("""<style>
html,body,.stApp{background:#fcf3e8}
[data-testid="stHeader"],footer,#MainMenu,[data-testid="stToolbar"]{display:none!important}
.block-container,.stMainBlockContainer{max-width:none!important;padding:0!important}
[data-testid="stVerticalBlock"]{gap:0!important}
iframe{display:block;border:0;width:100%}
</style>""", unsafe_allow_html=True)


@st.cache_resource
def service():
    records = json.loads((ROOT / "frontend/assets/books.json").read_text())
    return BookRecService(records)


backend = service()
if "reader" not in st.session_state:
    st.session_state.reader = secrets.token_hex(16)
    db.register_access_code(st.session_state.reader)
st.session_state.setdefault("ack", "")
st.session_state.setdefault("backend_error", "")

bookrec = components.declare_component("bookrec_design", path=str(ROOT / "frontend"))
value = bookrec(
    state=backend.state(st.session_state.reader),
    ack=st.session_state.ack,
    error=st.session_state.backend_error,
    default=None,
    key="bookrec_design_ui",
)
if isinstance(value, dict) and value.get("id") and value["id"] != st.session_state.ack:
    try:
        if value.get("action") == "restore_reader":
            st.session_state.reader = backend.restore(value.get("reader"), value.get("snapshot"))
        elif value.get("action") == "sync_state":
            backend.save(st.session_state.reader, value.get("favorites"), value.get("statuses"))
        else:
            raise ValueError("Белгісіз әрекет")
        st.session_state.backend_error = ""
    except ValueError as error:
        st.session_state.backend_error = str(error)
    st.session_state.ack = value["id"]
    st.rerun()
