FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY traslator.py .
EXPOSE 8001
CMD ["python", "traslator.py"]
