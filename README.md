# 🚀 AI-Powered Real Estate CRM

A state-of-the-art Customer Relationship Management (CRM) system specifically designed for real estate agents and agencies, supercharged with Artificial Intelligence.

![CRM Dashboard Mockup](https://raw.githubusercontent.com/seetharamarao817/generic_crm_real_estate_agents_with_AI/main/docs/image.png)

## ✨ Core Features

### 🧠 AI Intelligence
- **P2P Lead Scoring**: Automatically rank leads based on their likelihood to convert using advanced AI algorithms.
- **Deep AI Research**: Generate comprehensive background reports on leads and companies with one click.
- **Universal AI Compliance**: Automated compliance checking for communications and documents to ensure regulatory standards are met.
- **Smart Proposal Generation**: Create tailored property proposals and contracts using AI-driven templates.
- **Automated Activity Logging**: All AI-driven communications (Emails, SMS) are automatically summarized and logged in the lead's activity timeline.

### 🏠 CRM Essentials
- **Lead Pipeline**: Visual drag-and-drop kanban board for managing lead stages.
- **Approvals Inbox**: Centralized hub for managing and reviewing pending approvals for deals, contracts, and proposals.
- **Contact & Account Management**: Unified view of all stakeholders and organizations.
- **Deal Management**: Track opportunities, property listings, and sales progress.
- **Task & Calendar Integration**: Never miss a follow-up with integrated scheduling and reminders.

### 💬 Communication Suite
- **Multi-Channel Outreach**: Integrated Email, SMS, and WhatsApp (via MSG91) support.
- **Real-Time Notifications**: Instant alerts for new leads, task deadlines, and AI research completions.
- **Intelligent Chatbot**: AI-powered assistant for quick data retrieval and task automation.

### 🛡️ Enterprise Grade
- **Role-Based Access Control (RBAC)**: Granular permissions for Admins, Agents, and Guests.
- **Audit Logs**: Full transparency on data changes and user activities.
- **Secure Authentication**: Google OAuth and standard email/password support.

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React, Vite, TypeScript, Tailwind CSS, Lucide Icons |
| **Backend** | FastAPI (Python), SQLAlchemy, Alembic |
| **Database** | PostgreSQL with pgvector (for AI embeddings) |
| **AI/ML** | OpenAI GPT-4o / Gemini 1.5 Pro, ChromaDB |
| **Deployment** | Docker, Docker Compose |
| **Communication** | MSG91 (SMS/WhatsApp), SMTP (Email) |

## 🚀 Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development)
- Python 3.10+ (for local development)

### Quick Start with Docker

1. **Clone the repository:**
   ```bash
   git clone https://github.com/seetharamarao817/generic_crm_real_estate_agents_with_AI.git
   cd generic_crm_real_estate_agents_with_AI
   ```

2. **Setup environment variables:**
   Create a `.env` file in the root directory based on `.env.example`.

3. **Spin up the services:**
   ```bash
   docker-compose up -d
   ```

4. **Access the application:**
   - Frontend: `http://localhost:3000`
   - Backend API: `http://localhost:8000/docs`

### Seeding Demo Data
To populate the system with realistic real estate test data:
```bash
docker-compose exec backend python seed_presentation_data.py
```

## 📂 Project Structure

```text
├── backend/            # FastAPI Backend
│   ├── app/            # Application logic (AI, Routers, Models)
│   ├── alembic/        # DB Migrations
│   └── seeders/        # Data seeding scripts
├── frontend/           # React + Vite Frontend
│   ├── src/features/   # Modular CRM features
│   └── src/pages/      # Route pages
├── chatbot/            # Standalone AI Chatbot service
├── infra/              # Infrastructure & Docker configs
└── docs/               # Technical documentation
```

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
Built with ❤️ for Real Estate Professionals.
