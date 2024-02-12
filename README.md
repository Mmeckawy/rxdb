# Pipeline Demo

This README provides instructions for setting up and running a CI/CD pipeline demo. The demo showcases the entire lifecycle of a code change, from committing the code to deployment, and includes monitoring, alerting, good and bad check-ins, build history, test trends, and rollback scenarios.

## Table of Contents
1. [Pipeline in Action](#action)
2. [Test Cases](#test)

## 1. Pipeline in Action <a> href="#action" </a>

First off, we need to do CI by checking if there are any new commits, push, or pull requests on github. Jenkins does this step by getting triggered by a webhook created inside the github repositry. The webhook is connected to the jenkins server as shown below.

<p align="center">
  <img src="https://github.com/Mmeckawy/rxdb/assets/69309651/f240623a-cfbb-4ccc-8bb8-3d1e85fb5c99" alt="webhooks">
</p>

Inside the Jenkins server you should check the github hooks trigger in order to build automatically the piepline.

## 2. Test Cases <a> href="#test" </a>

In the figure below, build #13 was a bad check-in and did not run unit testing, because there was a syntax error in the script, after this error was fixed build #14 ran automatically a good check-in.
![example](https://github.com/Mmeckawy/rxdb/assets/69309651/def1f669-c2c0-494f-8214-bf584e38d9e9)

## Accessing Jenkins Pipeline

To view the Jenkins pipeline, follow these steps:

1. Open your web browser and navigate to [http://172.174.215.207:8080](http://20.121.56.70:8080).
2. Log in using the following credentials for testing:
   - **Username:** tester
   - **Password:** pass@123
3. Once logged in, you will have access to the Jenkins dashboard.
4. Navigate to the specific job or pipeline to view its details, configurations, and execution history.

The Jenkins pipeline automates the following stages:

1. **Build**: Compiles the source code and packages it into a deployable artifact.
2. **Test**: Executes unit tests to ensure the quality of the code.
3. **Deploy**: Deploys the artifact to the designated environment (e.g., staging or production).
