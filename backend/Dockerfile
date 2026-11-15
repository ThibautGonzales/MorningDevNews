# Backend image: the FastAPI app served by uvicorn.
FROM python:3.12-slim

WORKDIR /app

# Dependencies first, so Docker reuses this layer while only the code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# The database and the .env file with the API key go to /data, mounted from the host
# by docker-compose.yml, so they survive a rebuild of the image.
ENV DATA_DIR=/data
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
