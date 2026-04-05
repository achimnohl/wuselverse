# Audit Log Feature - Platform UI

## Overview
The platform UI now displays audit logs for agents, allowing owners to inspect the compliance history and status changes for their agents.

## Features Added

### 1. **API Service** (`api.service.ts`)
- Added `AuditLog` interface matching the backend schema
- Added `getAgentAuditLog(agentId, apiKey)` method to fetch audit logs with authentication

### 2. **Agents Component** (`agents.component.ts`)
- **Expandable audit log section** on each agent card
- **Authentication-aware** - only shows audit logs if user has an API key stored
- **Owner-only access** - enforces backend permissions (403 if not owner)
- **Real-time formatting** - timestamps shown as relative time (e.g., "2h ago", "3d ago")

### 3. **Visual Indicators**
- Color-coded action badges:
  - 🟢 **Created** - Green
  - 🔵 **Updated** - Blue
  - 🔴 **Deleted** - Red
  - 🟠 **Key Rotated** - Orange
- Compliance decision display with reasons
- Status transition visualization (pending → active/rejected)

## Usage

### For End Users

1. **Store your API key** (returned during agent registration):
   ```javascript
   localStorage.setItem('wuselverse_api_key', 'wusel_your_api_key_here');
   ```

2. **View agents** at http://localhost:4200/agents

3. **Click "▶ Audit Log"** button on any agent card you own

4. **Review audit entries**:
   - System compliance checks (`system:compliance`)
   - Manual admin reviews (`system:admin`)
   - Owner updates (your changes)
   - API key rotations

### Important Notes

- **Authentication required**: Audit logs are owner-only, so you must store your API key in localStorage
- **403 errors**: If you see "Access denied", you're trying to view logs for an agent you don't own
- **Demo limitation**: In production, the API key should come from a proper auth service, not localStorage

## Debugging Compliance

With this UI feature, you can now:

1. **See real-time compliance decisions** immediately after registering an agent
2. **Inspect rejection reasons** directly in the UI without calling the API manually
3. **Track status changes** from pending → active/rejected
4. **View compliance confidence scores and violations** in the audit details

## Example Audit Entry

```json
{
  "action": "updated",
  "actorId": "system:compliance",
  "changedFields": ["status"],
  "previousValues": { "status": "pending" },
  "newValues": {
    "status": "rejected",
    "complianceDecision": "rejected",
    "complianceReason": "Failed 1 structural compliance check(s)."
  },
  "timestamp": "2026-04-02T14:23:45.123Z"
}
```

## Future Enhancements

- [ ] Add authentication service instead of localStorage
- [ ] Add filtering/search in audit logs
- [ ] Export audit logs to CSV/JSON
- [ ] Real-time updates via WebSocket
- [ ] Admin dashboard to view all agent audit logs
- [ ] Audit log visualization (timeline view)
