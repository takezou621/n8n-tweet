# Security & Command Restrictions

## Dangerous Command Deny List

### Critical System Commands (NEVER EXECUTE)
- `sudo rm -rf /` - System destruction
- `sudo rm -rf /*` - System destruction variants
- `rm -rf /` - Root deletion attempts
- `rm -rf ~` - Home directory deletion
- `sudo dd if=/dev/zero of=/dev/sda` - Disk wiping
- `:(){ :|:& };:` - Fork bomb
- `sudo chmod -R 777 /` - Dangerous permission changes
- `sudo chown -R root:root /` - Ownership destruction

### Kubernetes Commands (REQUIRE EXPLICIT APPROVAL)
- `kubectl delete namespace` - Namespace deletion
- `kubectl delete all --all` - Mass resource deletion
- `kubectl apply -f` - Resource deployment (needs review)
- `kubectl delete -f` - Resource deletion
- `kubectl patch` - Resource modification
- `kubectl replace` - Resource replacement
- `helm delete` - Helm chart deletion
- `helm upgrade --force` - Forced upgrades

### Docker Commands (REQUIRE CAUTION)
- `docker system prune -a --volumes` - Complete cleanup
- `docker rm -f $(docker ps -aq)` - Remove all containers
- `docker rmi -f $(docker images -q)` - Remove all images
- `docker volume rm $(docker volume ls -q)` - Remove all volumes
- `docker network rm $(docker network ls -q)` - Remove all networks

### Database Commands (REQUIRE EXPLICIT APPROVAL)
- `DROP DATABASE` - Database deletion
- `TRUNCATE TABLE` - Table data deletion
- `DELETE FROM table WHERE 1=1` - Mass data deletion
- `UPDATE table SET` - Mass updates without WHERE clause
- `ALTER TABLE DROP COLUMN` - Schema destruction

### File System Operations (REQUIRE REVIEW)
- `find / -name "*.log" -delete` - Mass file deletion
- `chmod -R 000` - Permission destruction
- `chown -R nobody:nobody` - Ownership changes
- `mv /important/path /dev/null` - Moving to null device

## Safe Command Alternatives

### Instead of Dangerous rm Commands
```bash
# Safe alternatives for cleanup
rm -i file.txt                    # Interactive deletion
rm --preserve-root -rf /path      # Preserve root protection
trash file.txt                    # Move to trash (if available)
```

### Instead of Mass Docker Operations
```bash
# Targeted cleanup
docker container prune            # Remove stopped containers only
docker image prune               # Remove dangling images only
docker volume prune              # Remove unused volumes only
```

### Instead of Mass Kubernetes Operations
```bash
# Targeted operations
kubectl delete pod specific-pod   # Delete specific resources
kubectl get all -n namespace     # Review before deletion
kubectl describe resource name   # Inspect before changes
```

## Security Best Practices

### Command Execution Rules
1. **Always review commands before execution** - Especially those involving deletion or system changes
2. **Use dry-run flags when available** - `--dry-run`, `--what-if`, etc.
3. **Backup before destructive operations** - Always have rollback plans
4. **Use least privilege principle** - Avoid sudo unless absolutely necessary
5. **Validate paths and parameters** - Ensure commands target correct resources

### Environment Protection
- **Production environments require explicit approval** for any changes
- **Staging environments require review** for destructive operations
- **Development environments allow more freedom** but still require caution
- **Never execute untested commands** in production

### Approval Required Commands
Any command containing these patterns requires explicit user approval:
- `sudo` with destructive operations
- `rm -rf` with system paths
- `kubectl delete` with broad selectors
- `docker` with `--force` or mass operations
- Database operations affecting multiple records
- File operations on system directories

## Emergency Procedures

### If Dangerous Command is Suggested
1. **STOP** - Do not execute
2. **ANALYZE** - Understand the intent
3. **PROPOSE SAFER ALTERNATIVE** - Suggest less destructive approach
4. **REQUEST EXPLICIT APPROVAL** - Get user confirmation
5. **DOCUMENT** - Log the decision and reasoning

### Recovery Procedures
- Keep backups of critical configurations
- Document rollback procedures
- Maintain emergency contact information
- Have system restore procedures ready

## Implementation Notes

This security configuration should be:
- **Enforced at the execution layer** - Commands should be validated before execution
- **Logged for audit purposes** - All command attempts should be recorded
- **Regularly updated** - New dangerous patterns should be added as discovered
- **Environment-aware** - Different rules for different environments