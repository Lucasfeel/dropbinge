FROM node:18-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build
RUN test -f dist/index.html

FROM python:3.11-slim AS runtime
WORKDIR /app
ENV PYTHONUNBUFFERED=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py config.py database.py init_db.py ./
COPY services ./services
COPY utils ./utils
COPY views ./views
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

CMD ["sh", "-c", "python init_db.py && gunicorn app:app --bind 0.0.0.0:${PORT:-10000}"]
