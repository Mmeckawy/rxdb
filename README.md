# Pipeline Demo

This repository contains a Jenkins pipeline demo for continuous integration and continuous deployment.

## Accessing Jenkins Pipeline

To view the Jenkins pipeline, follow these steps:

1. Open your web browser and navigate to [http://20.121.56.70:8080](http://20.121.56.70:8080).
2. Log in using the following credentials for testing:
   - **Username:** test
   - **Password:** pass@123
3. Once logged in, you will have access to the Jenkins dashboard.
4. Navigate to the specific job or pipeline to view its details, configurations, and execution history.

The Jenkins pipeline automates the following stages:

1. **Build**: Compiles the source code and packages it into a deployable artifact.
2. **Test**: Executes unit tests to ensure the quality of the code.
3. **Deploy**: Deploys the artifact to the designated environment (e.g., staging or production).
