import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# =========================================================================
# DATABASE CONFIGURATION
# =========================================================================
#
# Option A: PostgreSQL (Recommended for production/collaboration)
# Replace 'your_password' with your actual PostgreSQL password.
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://postgres:nisha2118kumari@localhost:5432/taskflow"
)

# Option B: SQLite (Quick start fallback - requires zero installation)
# To use SQLite instead, uncomment the line below:
# DATABASE_URL = "sqlite:///./taskflow.db"

# =========================================================================
# ENGINE CREATION
# =========================================================================
if DATABASE_URL.startswith("sqlite"):
    # SQLite requires 'check_same_thread' config to allow multi-threaded access
    engine = create_engine(
        DATABASE_URL, 
        connect_args={"check_same_thread": False}
    )
else:
    # Standard configuration for PostgreSQL
    engine = create_engine(DATABASE_URL)

# Configure the session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative base class for models
Base = declarative_base()

# =========================================================================
# DATABASE SESSION DEPENDENCY
# =========================================================================
# This generator function opens a database session for each incoming request
# and guarantees that the session is closed when the request is complete.
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()