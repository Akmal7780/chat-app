FROM python:3.12-slim

WORKDIR /app

# system dependencies
RUN apt-get update && apt-get install -y \
    libmagic1 \
    gcc \
    libpq-dev \
    python3-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# pip upgrade 
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "-m", "daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application"]