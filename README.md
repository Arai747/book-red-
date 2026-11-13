# BookRec



- Басты бет, іздеу, жанр сүзгісі және 270 иллюстрациялық мұқаба — бастапқы дизайнмен бірдей.
- Python + Streamlit интерфейсті custom component ретінде көрсетеді.
- SQLite таңдаулыларды және «Оқимын / Оқып жатырмын / Оқып бітірдім» мәртебелерін сақтайды.
- TF-IDF + cosine similarity Python-да орындалып, оқырманға 12 кітап ұсынады.
- Браузердегі кездейсоқ оқырман коды мен жергілікті көшірме бет жаңартылғанда тізімді қайта ашуға көмектеседі.

## Іске қосу

```bash
python -m venv .venv
source .venv/bin/activate
# Windows: .venv\Scripts\activate
python -m pip install -r requirements.txt
streamlit run app.py
```



## Жаңа streamlit.app доменінде жариялау

[Streamlit-те жаңа қосымша ашу](https://share.streamlit.io/deploy?repository=Arai747%2Fbookrec-design-streamlit&branch=main&mainModule=app.py)

**Create app → Yup, I have an app** ішінде:

| Өріс | Мән |
|---|---|
| Repository | `Arai747/bookrec-design-streamlit` |
| Branch | `main` |
| Main file path | `app.py` |
| Python | `3.12` |
| App URL | Қолжетімді жаңа атау, мысалы `bookrec-qazaq-library` |

**Deploy** басылғаннан кейін Streamlit жаңа `*.streamlit.app` сілтемесін береді. Бұл жаңа қосымша болуы керек; бұрынғы қосымшаның параметрлерін өзгертпеңіз.

## Құрылым

- `app.py`: Streamlit кіріс нүктесі және интерфейс–Python оқиғалары.
- `frontend/`: мен жасаған BookRec дизайны, жергілікті қаріптер мен мұқабалар.
- `backend/database.py`: бөлек SQLite базасы; қосымша PostgreSQL қолдауы.
- `backend/service.py`: таңдауларды тексеру, оқу тізімі, Python ұсыныстары.
- `backend/recommender.py`: қазақ мәтініне арналған character 2–5 gram TF-IDF моделі.
- `tests/test_backend.py`: сақтау, қалпына келтіру, жеке оқырмандар, ұсыныстар және мұқабалар.

## Деректерді сақтау

SQLite файлы әдепкіде осы жаңа қосымшаның `backend/bookrec.db` жолында жасалады. `BOOKREC_DB_PATH` арқылы өз жолыңызды беруге болады. SQLite файлы GitHub-қа жүктелмейді.

Streamlit Community Cloud жергілікті дискідегі SQLite файлының тұрақты сақталуына кепілдік бермейді. Браузер көшірмесі сол браузерден қалпына келтіруге көмектеседі, бірақ тұрақты cloud storage орнына жүрмейді. Қажет болса, жаңа қосымшаның Secrets бөлімінде бөлек PostgreSQL базасының `DATABASE_URL` мәнін беріңіз.

Мұқабалар — көркем иллюстрациялар. Оқу сілтемелері сыртқы әдеби сайттарға апарады.

## Тексеру

```bash
python -m pip install pytest
python -m pytest -q
```

Браузерде бастапқы дизайн, SQLite-та таңдауды сақтау, оқу мәртебесі, 12 Python ұсынысы, 270 кітаптан іздеу және бетті жаңартқаннан кейін тізімді қалпына келтіру тексерілді.
