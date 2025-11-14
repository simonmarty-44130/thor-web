const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { TranscribeClient, StartTranscriptionJobCommand } = require('@aws-sdk/client-transcribe');
const { v4: uuidv4 } = require('uuid');

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});
const transcribeClient = new TranscribeClient({});

const JOBS_TABLE = process.env.JOBS_TABLE || 'thor-web-jobs';
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'thor-web-storage';
const REGION = process.env.AWS_REGION || 'eu-west-3';

/**
 * Lambda Handler - Upload MP3 et lance la transcription
 * Inspiré de Gabriel transcription-orchestrator
 */
exports.handler = async (event) => {
    console.log('Upload Handler - Event:', JSON.stringify(event));

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'POST,OPTIONS'
    };

    // Handle OPTIONS for CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        // Parse request body
        const body = JSON.parse(event.body);
        const { file, filename } = body;

        if (!file || !filename) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'File and filename are required' })
            };
        }

        // Get user info from authorizer
        const userId = event.requestContext?.authorizer?.claims?.sub || 'unknown';
        const userEmail = event.requestContext?.authorizer?.claims?.email || 'unknown';

        // Validate file is MP3
        if (!filename.toLowerCase().endsWith('.mp3')) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Only MP3 files are supported' })
            };
        }

        // Generate unique job ID
        const jobId = uuidv4();
        const transcriptionJobName = `thor-web-${jobId}`;
        const timestamp = Date.now();

        // Decode base64 file
        const fileBuffer = Buffer.from(file, 'base64');
        const fileSizeInMB = fileBuffer.length / (1024 * 1024);

        console.log(`File size: ${fileSizeInMB.toFixed(2)} MB`);

        // Check file size (max 500MB)
        if (fileSizeInMB > 500) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'File size exceeds 500MB limit' })
            };
        }

        // Upload to S3
        const s3Key = `${userId}/audio/${jobId}/${filename}`;

        await s3Client.send(new PutObjectCommand({
            Bucket: STORAGE_BUCKET,
            Key: s3Key,
            Body: fileBuffer,
            ContentType: 'audio/mpeg',
            Metadata: {
                userId: userId,
                jobId: jobId,
                originalFilename: filename
            }
        }));

        console.log(`File uploaded to S3: ${s3Key}`);

        // Start transcription job
        const mediaFileUri = `s3://${STORAGE_BUCKET}/${s3Key}`;

        const transcribeParams = {
            TranscriptionJobName: transcriptionJobName,
            Media: {
                MediaFileUri: mediaFileUri
            },
            MediaFormat: 'mp3',
            LanguageCode: 'fr-FR',
            OutputBucketName: STORAGE_BUCKET,
            OutputKey: `${userId}/transcriptions/${jobId}/transcript.json`,
            Settings: {
                ShowSpeakerLabels: false,
                ShowAlternatives: false
            }
        };

        await transcribeClient.send(new StartTranscriptionJobCommand(transcribeParams));
        console.log(`Transcription job ${transcriptionJobName} started`);

        // Save job to DynamoDB
        const jobItem = {
            job_id: jobId,
            user_id: userId,
            user_email: userEmail,
            status: 'TRANSCRIBING',
            file_name: filename,
            file_size_mb: parseFloat(fileSizeInMB.toFixed(2)),
            s3_key: s3Key,
            transcription_job_name: transcriptionJobName,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            timestamp: timestamp
        };

        await dynamoClient.send(new PutCommand({
            TableName: JOBS_TABLE,
            Item: jobItem
        }));

        console.log(`Job ${jobId} created in DynamoDB`);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: 'Upload successful, transcription started',
                job_id: jobId,
                status: 'TRANSCRIBING',
                file_name: filename,
                file_size_mb: fileSizeInMB.toFixed(2)
            })
        };

    } catch (error) {
        console.error('Error in upload handler:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};
