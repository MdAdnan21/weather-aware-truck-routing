
import os
from pathlib import Path

from dotenv import load_dotenv

# --------------------------------------------------
# Base directory and environment variables
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent

# Load variables from backend/.env
load_dotenv(BASE_DIR / ".env")

# --------------------------------------------------
# Django core settings
# --------------------------------------------------

SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY",
    "dev-only-insecure-key",
)

DEBUG = os.getenv("DJANGO_DEBUG", "false").lower() == "true"

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv(
        "DJANGO_ALLOWED_HOSTS",
        "localhost,127.0.0.1",
    ).split(",")
    if host.strip()
]

INSTALLED_APPS = [
    "corsheaders",
    "routing",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# This API is stateless and does not currently use a database.
DATABASES = {}

USE_TZ = True
TIME_ZONE = "UTC"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --------------------------------------------------
# CORS settings
# --------------------------------------------------

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173",
    ).split(",")
    if origin.strip()
]

# --------------------------------------------------
# Routing provider configuration
# --------------------------------------------------

ORS_API_KEY = os.getenv("ORS_API_KEY", "").strip()

ORS_PROFILE = os.getenv("ORS_PROFILE", "driving-hgv").strip()

ORS_BASE_URL = "https://api.openrouteservice.org"

# --------------------------------------------------
# Weather provider configuration
# --------------------------------------------------

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

HTTP_TIMEOUT_SECONDS = 20

# --------------------------------------------------
# Logging
# --------------------------------------------------

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}
