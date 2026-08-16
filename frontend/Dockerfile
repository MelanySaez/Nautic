# Use the official Node.js image
FROM node:16-alpine

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the project files
COPY . .

# Expose the port
EXPOSE 3000

# Run the application
CMD ["npm", "start"]
