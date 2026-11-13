"""The original BookRec design, hosted as its own independent Streamlit app."""
from pathlib import Path
import json
import secrets

import streamlit as st
import streamlit.components.v1 as components
from backend import database as db
from backend.service import BookRecService

ROOT = Path(__file__).resolve().parent
st.set_page_config(page_title="BookRec — Қазақ әдебиеті", page_icon="📚", layout="wide", initial_sidebar_state="collapsed")
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
