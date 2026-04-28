Role: You are a Senior AI Engineer with expertise in building robust, LLM - powered autonomous agents and scalable web applications.

    Objective: Build a chatbot system that takes a natural language user query(e.g., "what are apis") fetches relevant content from database(vector db), uses the relevant chunks as context, and returns a conversational response.

Technology Stack:
Language: Python 3
APIs: OpenRouter API(for LLM calls) and Hugging Face(for LLM calls and embeddings)
Web Framework: Flask(for the frontend wrapper)
Vector DB: Chroma Local storage
Environment: Python Virtual Environment(venv), .env for environment variables

Documentation Reference:
OpenRouter API Quickstart: https://openrouter.ai/docs/quickstart
Hugging Face: https://huggingface.co/docs/transformers/conversations, https://huggingface.co/docs/transformers/main_classes/pipelines

Core Requirements & Execution Steps:

Please complete the following steps in order.Provide the necessary terminal commands and complete Python code blocks for each.

    Step 1: Environment Setup
Provide the terminal commands to create a Python 3 virtual environment in the current working directory, activate it, and install the required dependencies(Flask, requests, python - dotenv, openai / openrouter clients, hugging face etc.).
    Constraint: All subsequent command operations must be assumed to run inside this virtual environment.

        Step 2: Exploration and system architect design
Explore the given documentation resources.
Design the system it will have two pipelines first it takes a document as input extracts its content splits it into chunks converts it into embedding and stores it in a vector db.
Second is chatbot pipeline where it takes user query retrieves relevant chunks and uses those chunks to return a response.

    Step 3: Build the documentation pipeline
From the frontend user can upload documents in the backend extract the data convert into chunks and store it in vector db.
Note the parameters in this code should not be hardcoded they should be taken from the env files example type of chunking: "sentence" or "paragraph", chunk size those values must be taken from env so that the code is very reusable we need to change from env only.

    Step 4: Build the chat pipeline
Develop a web interface that takes a user query as input.
In the backend add a loop like this first try with OpenRouter API call and a loop if it fails or exceeded token limit switch to the Hugging Face pipeline.
Also for both the Hugging Face and OpenRouter there will be a list of models that can be used if one model fails it can switch to another model.
Note that the list of model names for OpenRouter and Hugging Face(separate list) should be read from env only any other parameters must also be from env only.
Add a conversation history so the LLM will have previous conversation questions.
For questions like hello, hi, how are you today for basic interactions we will add a classifier if these questions are greetings we will filter them out before hitting database or LLM generation we will return a manual response here.

    Step 5: Frontend Wrapper & Logging
Build a Flask web application that serves a simple HTML UI where users can input their queries and upload documents.
    Logging: Implement Python logging module.Add detailed logs printed in terminal for each phase of all operations such as received query, uploading document, generating LLM response.
Provide instructions on how to run the Flask server locally.

Strict Constraints:
Environment Variables: ALL important values(OpenRouter API key, model names) MUST be stored in and accessed from a.env file.Do not hardcode any keys or configurable URLs in the Python scripts.Provide a.env.example file in your output.

Production Quality:
Write clean, modular, and well - commented code with error handling.

Structural Hierarchy:
Separate folder for frontend and backend components.