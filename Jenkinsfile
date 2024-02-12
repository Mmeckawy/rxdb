pipeline {
    agent any
    tools {
        nodejs "NodeJs"
    }
    stages {
        stage('Checkout') {
            steps {
                git 'https://github.com/Mmeckawy/rxdb.git'
            }
        }
        
        stage('Install dependencies') {
            steps {
                // Install npm dependencies
                sh 'npm install'
            }
            post {
                success {
                    // Archive build artifacts
                    archiveArtifacts artifacts: '**/dist/**', fingerprint: true
                }
            }
        }
        
        stage('Run unit testing') {
            steps {
                timeout(time: 20, unit: 'MINUTES') {
                    sh 'npm run test:fast:dexie'
                }
            }
            post {
                success {
                    // Archive build artifacts
                    archiveArtifacts artifacts: '**/dist/**', fingerprint: true
                }
            }
        }
        
        stage('Run performance testing') {
            steps {
                timeout(time: 20, unit: 'MINUTES') {
                    // Performance testing using mocha
                    sh 'npm run test:performance:memory:node'
                }
            }
        }
        
        stage('Build Docker image') {
            steps {
                sh 'docker build -t rxdbapp.azurecr.io/rxdb-app:latest .'
            }
        }
        
        stage('Push image') {
            steps {
                azureCLI commands: [
                    [exportVariablesString: '', script: 'az acr login -n rxdbapp'], 
                    [exportVariablesString: '', script: 'docker push rxdbapp.azurecr.io/rxdb-app:latest']
                ],
                principalCredentialId: 'AzureServicePrincipal'
            }
        }
        
        stage('Deploy web app') {
            steps {
                withCredentials([azureServicePrincipal('ASP')]) {
                    sh "az login --service-principal -u ${AZURE_CLIENT_ID} -p ${AZURE_CLIENT_SECRET} --tenant ${AZURE_TENANT_ID}"
                }
                withCredentials([usernamePassword(credentialsId: 'rxdbapp', passwordVariable: 'password', usernameVariable: 'username')]) {
                    sh "az webapp config container set --name rxdb-deploy --resource-group Ci-rxdb --docker-custom-image-name rxdbapp.azurecr.io/rxdb-app:latest --docker-registry-server-url https://rxdb-deploy.azurecr.io --docker-registry-server-user ${username} --docker-registry-server-password ${password}"
                }
            }
            post {
                success {
                    // Send email notification for build failure
                    emailext subject: "Build Succeeded: ${currentBuild.fullDisplayName}",
                              body: "The build was finished successfully.",
                              to: "mariam.meckawy@hotmail.com",
                              attachLog: true
                }
                failure {
                    // Send email notification for build failure
                    emailext subject: "Build failed: ${currentBuild.fullDisplayName}",
                              body: "The build has failed. Please check the Jenkins console output for more details.",
                              to: "mariam.meckawy@hotmail.com",
                              attachLog: true
                }
            }
        }
    }
    
    post {
        always {
        // Trigger the pipeline again after rollback
        script {
            // Trigger the pipeline again if the build failed
            if (currentBuild.result == 'FAILURE') {
                currentBuild.result = 'ABORTED' // Abort the current build to trigger a new one
            }
        }
    }
}
}
