# app.py
# pip install streamlit pypdf python-docx nltk
# streamlit run app.py

import re
from collections import Counter
import streamlit as st

# -------------------------
# Text extraction
# -------------------------
def extract_text_from_pdf_bytes(data: bytes) -> str:
    from pypdf import PdfReader
    import io
    reader = PdfReader(io.BytesIO(data))
    parts = []
    for page in reader.pages:
        parts.append(page.extract_text() or "")
    return "\n".join(parts)

def extract_text_from_docx_bytes(data: bytes) -> str:
    import io
    import docx
    doc = docx.Document(io.BytesIO(data))
    return "\n".join(p.text for p in doc.paragraphs if p.text)

def extract_text_from_txt_bytes(data: bytes) -> str:
    return data.decode("utf-8", errors="ignore")

# -------------------------
# NLP helpers
# -------------------------
def ensure_nltk():
    import nltk
    try:
        from nltk.corpus import stopwords
        _ = stopwords.words("english")
    except Exception:
        nltk.download("stopwords", quiet=True)
    try:
        import nltk.corpus
        _ = nltk.corpus.wordnet.ensure_loaded()
    except Exception:
        nltk.download("wordnet", quiet=True)
    try:
        nltk.data.find("tokenizers/punkt")
    except Exception:
        nltk.download("punkt", quiet=True)

def tokenize(text: str):
    return re.findall(r"[a-zA-Z]+(?:'[a-zA-Z]+)?|\d+(?:\.\d+)?", text)

def simple_sentence_split(text: str):
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    return re.split(r"(?<=[.!?])\s+", text)

def clean_text_pipeline(
    text: str,
    lowercasing=True,
    stop_word_removal=True,
    stemming=False,
    lemmatization=True,
    remove_rare_words=True,
    remove_frequent_words=True,
    rare_min_count=2,
    frequent_top_k=15,
):
    ensure_nltk()
    from nltk.corpus import stopwords
    from nltk.stem import PorterStemmer, WordNetLemmatizer

    if lowercasing:
        text = text.lower()

    words = tokenize(text)

    if stop_word_removal:
        sw = set(stopwords.words("english"))
        words = [w for w in words if w not in sw]

    counts = Counter(words)

    if remove_rare_words:
        words = [w for w in words if counts[w] >= rare_min_count]

    if remove_frequent_words and words:
        top = {w for w, _ in Counter(words).most_common(frequent_top_k)}
        words = [w for w in words if w not in top]

    if lemmatization:
        lemmatizer = WordNetLemmatizer()
        words = [lemmatizer.lemmatize(w) for w in words]

    if stemming:
        stemmer = PorterStemmer()
        words = [stemmer.stem(w) for w in words]

    return words

def pick_important_sentences(raw_text: str, cleaned_tokens, max_sentences: int = 10):
    token_freq = Counter(cleaned_tokens)
    sentences = simple_sentence_split(raw_text)

    scored = []
    for s in sentences:
        s_tokens = tokenize(s.lower())
        score = sum(token_freq.get(t, 0) for t in s_tokens)

        # small heuristic to avoid tiny/huge sentences
        if len(s_tokens) < 6:
            score *= 0.6
        elif len(s_tokens) > 40:
            score *= 0.7

        scored.append((score, s.strip()))

    scored.sort(reverse=True, key=lambda x: x[0])
    top = [s for score, s in scored if score > 0][:max_sentences]

    # Keep original order for readability
    top_set = set(top)
    ordered = [s for s in sentences if s.strip() in top_set]
    return ordered[:max_sentences]

def build_student_prompt(important_sentences, curriculum_hint: str):
    bullets = "\n".join(f"- {s}" for s in important_sentences if s)
    return f"""You are a helpful tutor for a school student.

Student profile:
- School student
- Middle school / high school
- Curriculum: American SATs or British IGCSE
- The student may ask about any subject.
Curriculum hint (optional): {curriculum_hint}

Task:
Using ONLY the key information below, answer the student's question clearly and step-by-step.
If the material suggests a specific curriculum (SAT vs IGCSE) mention it; otherwise keep it general.
Use simple language, then add exam-style tips.

Key material (important extracted points):
{bullets}

Now wait for the student's question and respond.
"""

# -------------------------
# Streamlit UI
# -------------------------
st.set_page_config(page_title="Upload → Important Stuff Prompt", layout="wide")
st.title("📄 Upload (PDF/DOCX/TXT) → Generate “Important Stuff” Prompt")

with st.sidebar:
    st.header("Cleaning options")
    lowercasing = st.checkbox("Lowercasing", True)
    stop_word_removal = st.checkbox("Stop Word Removal", True)
    lemmatization = st.checkbox("Lemmatization", True)
    stemming = st.checkbox("Stemming (optional)", False)

    st.divider()
    st.subheader("Rare / frequent word removal")
    remove_rare_words = st.checkbox("Remove Rare Words", True)
    rare_min_count = st.number_input("Rare min count", min_value=1, max_value=10, value=2, step=1)

    remove_frequent_words = st.checkbox("Remove Frequent Words", True)
    frequent_top_k = st.number_input("Remove top-K frequent words", min_value=0, max_value=200, value=15, step=1)

    st.divider()
    st.subheader("Output")
    max_sentences = st.slider("Important sentences to keep", 3, 25, 10)

st.write("Upload a file, and you’ll get a copy/paste-ready prompt containing only the most important points.")

col1, col2 = st.columns([1, 1])

with col1:
    uploaded = st.file_uploader("Upload a PDF, DOCX, or TXT", type=["pdf", "docx", "txt"])
    curriculum_hint = st.text_input("Curriculum hint (optional)", value="SAT or IGCSE (unknown)")

with col2:
    st.info(
        "Tip: If your PDFs are scanned images (no selectable text), pypdf may return empty text. "
        "In that case you’ll need OCR (e.g., Tesseract) to extract text."
    )

if uploaded:
    data = uploaded.getvalue()
    name = uploaded.name.lower()

    try:
        if name.endswith(".pdf"):
            raw_text = extract_text_from_pdf_bytes(data)
        elif name.endswith(".docx"):
            raw_text = extract_text_from_docx_bytes(data)
        else:
            raw_text = extract_text_from_txt_bytes(data)
    except Exception as e:
        st.error(f"Failed to extract text: {e}")
        st.stop()

    if not raw_text.strip():
        st.warning("No text was extracted from the file.")
        st.stop()

    cleaned_tokens = clean_text_pipeline(
        raw_text,
        lowercasing=lowercasing,
        stop_word_removal=stop_word_removal,
        stemming=stemming,
        lemmatization=lemmatization,
        remove_rare_words=remove_rare_words,
        remove_frequent_words=remove_frequent_words,
        rare_min_count=int(rare_min_count),
        frequent_top_k=int(frequent_top_k),
    )

    important = pick_important_sentences(raw_text, cleaned_tokens, max_sentences=int(max_sentences))
    prompt = build_student_prompt(important, curriculum_hint=curriculum_hint)

    st.subheader("✅ Important sentences extracted")
    st.write("\n".join([f"{i+1}. {s}" for i, s in enumerate(important)]) or "No important sentences found.")

    st.subheader("🧠 Prompt (copy/paste into your LLM)")
    st.code(prompt, language="text")

    st.download_button(
        "Download prompt as .txt",
        data=prompt.encode("utf-8"),
        file_name="important_stuff_prompt.txt",
        mime="text/plain",
    )

    with st.expander("Preview extracted raw text (first 3,000 chars)"):
        st.text(raw_text[:3000])
