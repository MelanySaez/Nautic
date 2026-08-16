FROM n8nio/n8n:latest

# Switch to root for system installations
USER root

# Install Python, pip, poppler (required for pdf2image), and build dependencies for Pillow
RUN apk update && \
    apk add --no-cache \
        python3 \
        py3-pip \
        poppler-utils \
        musl-dev \
        gcc \
        g++ \
        libjpeg-turbo-dev \
        zlib-dev \
        freetype-dev \
        lcms2-dev \
        openjpeg-dev \
        tiff-dev \
        tk-dev \
        harfbuzz-dev \
        fribidi-dev \
        cairo-dev \
        pango-dev

# Create a virtual environment
RUN python3 -m venv /opt/venv

# Set environment variables to use the virtual environment
ENV PATH="/opt/venv/bin:$PATH"

# Copy requirements.txt
COPY requirements.txt /tmp/requirements.txt

# Install Python packages inside the virtual environment
RUN pip install --no-cache-dir -r /tmp/requirements.txt


# Optional: Remove requirements file
RUN rm /tmp/requirements.txt

# Switch back to node user
USER node