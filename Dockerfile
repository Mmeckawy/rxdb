FROM node:20

COPY . /usr/share/nginx/html/

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Expose the port the app runs on
EXPOSE 3003

# Define the command to run the app
CMD ["npm", "run", "docs:serve"]
