import os
import logging
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template
import backend.database as db

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(
    __name__,
    template_folder='../frontend/templates',
    static_folder='../frontend/static'
)

app.config['UPLOAD_FOLDER'] = os.environ.get("UPLOADS_DIR", "./uploads")
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Initialize DB
db.init_db()

from backend.document_pipeline import DocumentPipeline
from backend.chat_pipeline import ChatPipeline

try:
    doc_pipeline = DocumentPipeline()
    chat_pipeline = ChatPipeline()
except Exception as e:
    logger.error(f"❌ Failed to initialize pipelines: {e}")

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/sessions", methods=["GET", "POST"])
def manage_sessions():
    if request.method == "POST":
        data = request.json or {}
        title = data.get("title", "New Chat")
        session_id = db.create_session(title=title)
        return jsonify({"session_id": session_id, "title": title})
    else:
        sessions = db.get_all_sessions()
        return jsonify({"sessions": sessions})

@app.route("/api/sessions/<session_id>/messages", methods=["GET"])
def get_messages(session_id):
    messages = db.get_session_history(session_id)
    return jsonify({"messages": messages})

@app.route("/api/sessions/<session_id>/title", methods=["POST"])
def generate_title(session_id):
    data = request.json
    first_message = data.get("message", "")
    if not first_message:
        return jsonify({"error": "No message provided."}), 400
    
    prompt = f"Summarize this query into a short 3-4 word title. Do not wrap in quotes or add extra text. Query: {first_message}"
    
    try:
        # Quick non-streamed generation
        result = chat_pipeline.chat(
            user_query=prompt, 
            history=[], 
            session_id=None, # do not save to DB!
            selected_model=data.get("model"),
            custom_api_key=data.get("api_key")
        )
        new_title = result["response"].strip(' \t\n\r"\'')[:30] # constrain length
        db.update_session_title(session_id, new_title)
        return jsonify({"title": new_title})
    except Exception as e:
        logger.error(f"Failed to generate title: {e}")
        return jsonify({"error": "Title generation failed"}), 500

@app.route("/upload", methods=["POST"])
def upload_file():
    logger.info("📁 [API] Received request to upload file.")
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
        
    file = request.files['file']
    scope = request.form.get("scope", "global")
    session_id = request.form.get("session_id", "")
    
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
        
    if file and (file.filename.lower().endswith('.pdf') or file.filename.lower().endswith('.txt')):
        from werkzeug.utils import secure_filename
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        file.save(filepath)
        logger.info(f"📁 [API] Processing file {filename} [Scope: {scope}, Session: {session_id}]")
        
        success = doc_pipeline.process_file(filepath, scope=scope, session_id=session_id)
        
        if success:
            return jsonify({"message": f"File {filename} parsed into {scope} knowledge base."})
        else:
            return jsonify({"error": "Failed to extract text."}), 500
    else:
        return jsonify({"error": "Unsupported file format. Use PDF or TXT."}), 400

@app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    user_query = data.get("query", "")
    history = data.get("history", [])
    session_id = data.get("session_id")
    selected_model = data.get("model")
    api_key = data.get("api_key")
    
    logger.info(f"💬 [API] Chat query received. Session: {session_id}")
    
    if not user_query:
        return jsonify({"error": "Enter a message."}), 400
        
    if not session_id:
        # Create a fallback session if none provided
        session_id = db.create_session("Fallback Session")
        
    try:
        result = chat_pipeline.chat(
            user_query=user_query, 
            history=history, 
            session_id=session_id,
            selected_model=selected_model,
            custom_api_key=api_key
        )
        return jsonify(result)
    except Exception as e:
        logger.error(f"❌ [API] Error during chat iteration: {e}")
        return jsonify({"error": "Internal server error."}), 500

@app.route("/api/models", methods=["GET"])
def get_models():
    # Return list of models from env for UI dropdown
    return jsonify({
        "openrouter": chat_pipeline.or_models,
        "huggingface": chat_pipeline.hf_models
    })

if __name__ == "__main__":
    port = int(os.environ.get("FLASK_RUN_PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
