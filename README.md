# Pipeline Demo

This README provides instructions for setting up and running a CI/CD pipeline demo. The demo showcases the entire lifecycle of a code change, from committing the code to deployment, and includes monitoring, alerting, good and bad check-ins, build history, test trends, and rollback scenarios.

## Table of Contents
1. [Pipeline in Action](#action)
2. [Failure Alert](#alert)
3. [Test Cases](#test)
4. [Build History and Test Trends](#trend)
5. [Rollback Scenario](#rollback)
6. [Run the Pipeline](#run)
7. [Blue/Green Deployment](#dep)

## 1. Pipeline in Action <a href="#action"> </a>

First off, we need to do CI by checking if there are any new commits, push, or pull requests on github. Jenkins does this step by getting triggered by a webhook created inside the github repositry. The webhook is connected to the jenkins server as shown below.

<p align="center">
  <img src="https://github.com/Mmeckawy/rxdb/assets/69309651/f240623a-cfbb-4ccc-8bb8-3d1e85fb5c99" alt="webhooks">
</p>

Inside the Jenkins server you should check the github hooks trigger in order to build automatically the piepline.

## 2. Failure Alert <a href="alert"> </a>

## 3. Test Cases <a href="#test"> </a>

In the figure below, build #21 was a bad check-in as it had bad azure credentials, after this error was fixed build #22 ran automatically a good check-in.
<p align="center">
  <img src="https://github.com/Mmeckawy/rxdb/assets/69309651/632ca1e0-7ecf-485c-ae85-2fa0c87cbcd5" alt="webhooks">
</p>


## 4. Build History and Test Trends <a href="#trend"></a>

<p align="center">
  <img src="https://github.com/Mmeckawy/rxdb/assets/69309651/ceceb1e6-b13a-4f94-a10b-ac32ea4fa605" alt="webhooks">
</p>

## 5. Rollback Scenario <a href="#rollback"></a>

By adding the following script to the pipeline, the failed build is aborted, and the pipeline is triggered to use the last successful build.
<br>
`post {
        always {
            // Trigger the pipeline again after rollback
            script {
                // Trigger the pipeline again if the build failed
                if (currentBuild.result == 'FAILURE') {
                    currentBuild.result = 'ABORTED' // Abort the current build to trigger a new one
                }
            }
        }
    }`

## 6. Run the Pipeline <a href="#run"></a>

To view and run the Jenkins pipeline, follow these steps:

1. Open your web browser and navigate to [http://172.174.215.207:8080](http://172.174.215.207:8080).
2. Log in using the following credentials for testing:
   - **Username:** tester
   - **Password:** pass@123
3. Once logged in, you will have access to the Jenkins dashboard.
4. Navigate to the rxdb-pipeline job
5. You can now run the pipeline

## 7. Blue/Green Deployement <a  href="#dep"></a>
Netlify is a proxy used for deployment, load balancing and continuous deployment. The blue/green deployment methodolgy was applied by treating the master branch as the green part of the method and created a branch for the blue part. Then, you should specify those 2 branches at the Site configuration --> Split testing, as shown in the figure below.

<p align="center">
  <img src="https://github.com/Mmeckawy/rxdb/assets/69309651/5bed4974-b1cf-4f7e-93ed-81a823f23d86" alt="webhooks">
</p>

Netlify performs split testing between the 2 branches while simultaneously performing CD.

