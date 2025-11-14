const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqsClient = new SQSClient({});
const s3Client = new S3Client({});

const JOBS_TABLE = process.env.JOBS_TABLE || 'thor-web-jobs';
const ARTICLE_QUEUE_URL = process.env.ARTICLE_QUEUE_URL || 'https://sqs.eu-west-3.amazonaws.com/888577030217/thor-web-article-queue';
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'thor-web-storage';

/**
 * Lambda Handler - Transcription complete callback
 * Inspiré de Gabriel transcription-complete
 * Déclenché par EventBridge quand Amazon Transcribe termine
 */
exports.handler = async (event) => {
    console.log('Transcription Complete Handler - Event:', JSON.stringify(event));

    try {
        const { detail } = event;
        const transcriptionJobName = detail.TranscriptionJobName;
        const status = detail.TranscriptionJobStatus;

        // Extract job ID from transcription job name (format: thor-web-{jobId})
        const jobId = transcriptionJobName.replace('thor-web-', '');

        console.log(`Processing transcription completion: ${jobId}, Status: ${status}`);

        // Get job info from DynamoDB
        const jobData = await dynamoClient.send(new GetCommand({
            TableName: JOBS_TABLE,
            Key: { job_id: jobId }
        }));

        if (!jobData.Item) {
            console.error(`Job ${jobId} not found in database`);
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Job not found' })
            };
        }

        const { user_id, s3_key } = jobData.Item;

        if (status === 'COMPLETED') {
            console.log(`Transcription completed successfully for job ${jobId}`);

            // Get transcript URI from event detail
            const transcriptUri = detail.TranscriptFileUri;
            const transcriptKey = `${user_id}/transcriptions/${jobId}/transcript.json`;

            // Read transcript from S3
            let transcriptText = '';
            try {
                const transcriptObject = await s3Client.send(new GetObjectCommand({
                    Bucket: STORAGE_BUCKET,
                    Key: transcriptKey
                }));

                const transcriptJson = await streamToString(transcriptObject.Body);
                const transcriptData = JSON.parse(transcriptJson);

                // Extract text from transcript
                transcriptText = transcriptData.results.transcripts[0].transcript;

                console.log(`Transcript extracted: ${transcriptText.length} characters`);

            } catch (error) {
                console.error('Error reading transcript from S3:', error);

                // Update job status to failed
                await dynamoClient.send(new UpdateCommand({
                    TableName: JOBS_TABLE,
                    Key: { job_id: jobId },
                    UpdateExpression: 'SET #status = :status, error_message = :error, updated_at = :updated',
                    ExpressionAttributeNames: {
                        '#status': 'status'
                    },
                    ExpressionAttributeValues: {
                        ':status': 'TRANSCRIPTION_FAILED',
                        ':error': `Failed to read transcript: ${error.message}`,
                        ':updated': new Date().toISOString()
                    }
                }));

                throw error;
            }

            // Update job status to TRANSCRIBED
            await dynamoClient.send(new UpdateCommand({
                TableName: JOBS_TABLE,
                Key: { job_id: jobId },
                UpdateExpression: 'SET #status = :status, transcript_uri = :uri, transcript_text = :text, updated_at = :updated, transcribed_at = :transcribed',
                ExpressionAttributeNames: {
                    '#status': 'status'
                },
                ExpressionAttributeValues: {
                    ':status': 'TRANSCRIBED',
                    ':uri': transcriptUri,
                    ':text': transcriptText,
                    ':updated': new Date().toISOString(),
                    ':transcribed': new Date().toISOString()
                }
            }));

            console.log(`Job ${jobId} status updated to TRANSCRIBED`);

            // Send to article generation queue
            await sqsClient.send(new SendMessageCommand({
                QueueUrl: ARTICLE_QUEUE_URL,
                MessageBody: JSON.stringify({
                    job_id: jobId,
                    user_id: user_id,
                    transcript_text: transcriptText,
                    s3_key: s3_key
                })
            }));

            console.log(`Job ${jobId} sent to article generation queue`);

        } else if (status === 'FAILED') {
            console.error(`Transcription failed for job ${jobId}`);

            // Get failure reason from event
            const failureReason = detail.FailureReason || 'Unknown transcription error';

            // Update job status to failed
            await dynamoClient.send(new UpdateCommand({
                TableName: JOBS_TABLE,
                Key: { job_id: jobId },
                UpdateExpression: 'SET #status = :status, error_message = :error, updated_at = :updated',
                ExpressionAttributeNames: {
                    '#status': 'status'
                },
                ExpressionAttributeValues: {
                    ':status': 'TRANSCRIPTION_FAILED',
                    ':error': failureReason,
                    ':updated': new Date().toISOString()
                }
            }));

            console.log(`Job ${jobId} marked as failed: ${failureReason}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Transcription completion processed' })
        };

    } catch (error) {
        console.error('Error processing transcription completion:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};

/**
 * Convert readable stream to string
 */
async function streamToString(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
}
