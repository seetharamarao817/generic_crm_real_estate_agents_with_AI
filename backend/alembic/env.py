from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from sqlalchemy import text
from alembic import context

# Import all models so Alembic can detect them
from app.core.db import Base
import app.models  # noqa: F401 — triggers all model imports

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url():
    from app.core.config import settings
    # Alembic uses sync engine — swap async driver to sync psycopg v3
    url = settings.database_url
    # postgresql+psycopg (async) → postgresql+psycopg (sync works too with v3)
    # Just strip the async suffix
    return url.replace("postgresql+psycopg://", "postgresql+psycopg://")


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    from sqlalchemy import create_engine
    connectable = create_engine(get_url(), poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
