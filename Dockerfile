FROM node:20

# Set the working directory in the container
WORKDIR /usr/src/app/examples/react

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm run preinstall && npm install

# Copy the application files into the container
COPY . .

# Build the React app
RUN npm run build

# Expose the port the app runs on (if necessary)
EXPOSE 3000

# Define the command to run the app
CMD ["npm", "start"]
