FROM node:20

# Copy the rest of the application code to the working directory
COPY . .

# Change directory to examples/react
WORKDIR /examples/react

RUN npm run preinstall && npm install

# Set the PORT environment variable
ENV PORT=8888

# Define the command to run the app
CMD ["npm", "run", "dev"]
