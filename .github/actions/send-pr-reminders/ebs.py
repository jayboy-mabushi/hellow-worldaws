import boto3
import datetime

def lambda_handler(event, context):
    try:
        # Specify the volume IDs you want to back up
        volume_ids = ['vol-05ec1475f584e0c1b', 'vol-04a0cfe07f6adee1f']
        region = 'us-east-1'
        
        # Initialize a session using Boto3
        ec2 = boto3.client('ec2', region_name=region)
        
        for volume_id in volume_ids:
            # Get the instance ID associated with the volume
            volume_info = ec2.describe_volumes(VolumeIds=[volume_id])['Volumes'][0]
            attachments = volume_info.get('Attachments', [])
            if not attachments:
                print(f"No instance attached to the specified volume: {volume_id}")
                continue
            
            instance_id = attachments[0]['InstanceId']
            
            # Get the instance name
            instance = ec2.describe_instances(InstanceIds=[instance_id])['Reservations'][0]['Instances'][0]
            instance_name = None
            for tag in instance.get('Tags', []):
                if tag['Key'] == 'Name':
                    instance_name = tag['Value']
                    break
            
            if not instance_name:
                instance_name = 'Unnamed-Instance'

            print(f"Volume ID: {volume_id}, Instance ID: {instance_id}, Instance Name: {instance_name}")

            # Current date for description and tags
            current_date = datetime.datetime.now().strftime('%Y-%m-%d')
            description = f"Backup-{volume_id}-{current_date}"

            # Create snapshot
            response = ec2.create_snapshot(
                VolumeId=volume_id,
                Description=description
            )
            
            snapshot_id = response['SnapshotId']
            print(f"Snapshot {snapshot_id} created successfully for volume {volume_id}")

            # Wait for the snapshot to be available (optional, but recommended for tagging)
            waiter = ec2.get_waiter('snapshot_completed')
            waiter.wait(SnapshotIds=[snapshot_id])
            print(f"Snapshot {snapshot_id} is now available")

            # Tag the snapshot with the instance name, volume ID, and current date
            ec2.create_tags(
                Resources=[snapshot_id],
                Tags=[
                    {
                        'Key': 'Name',
                        'Value': f"{instance_name}-{volume_id}-{current_date}"
                    },
                    {
                        'Key': 'BackupDate',
                        'Value': current_date
                    },
                    {
                        'Key': 'InstanceName',
                        'Value': instance_name
                    },
                    {
                        'Key': 'VolumeID',
                        'Value': volume_id
                    }
                ]
            )

        return {
            'statusCode': 200,
            'body': "Snapshots created and tagged successfully for specified volumes."
        }
    
    except Exception as e:
        print(f"Error creating snapshot or tagging: {str(e)}")
        return {
            'statusCode': 500,
            'body': f"Error creating snapshot or tagging: {str(e)}"
        }
