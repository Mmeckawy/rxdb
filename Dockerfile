FROM node:20

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Change directory to examples/react
WORKDIR /usr/src/app/examples/react

RUN npm run preinstall && npm install

# Set the PORT environment variable
ENV PORT=8888

# Expose the port the app runs on
EXPOSE 8888

# Define the command to run the app
CMD ["npm", "run", "dev"]
