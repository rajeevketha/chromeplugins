/**
 * Permission investigator helpers — interpret User + ObjectPermissions + FieldPermissions
 * and PermissionSetAssignment payloads from Salesforce APIs.
 */

export function analyzePermissions({ user, objectDescribe, objectPerms = [], fieldPerms = [], assignments = [], objectApiName }) {
  const findings = [];
  const obj = objectApiName || objectDescribe?.name || "Object";

  if (user) {
    findings.push({
      severity: "info",
      title: "User",
      detail: `${user.Name || user.Username || user.Id} · ProfileId ${user.ProfileId || "—"} · Active ${user.IsActive}`
    });
  }

  if (assignments?.length) {
    findings.push({
      severity: "info",
      title: "Permission set assignments",
      detail: assignments
        .map((a) => a.PermissionSet?.Name || a.PermissionSetGroup?.MasterLabel || a.PermissionSetId)
        .filter(Boolean)
        .slice(0, 20)
        .join(", ")
    });
  }

  const crud = {
    create: false,
    read: false,
    edit: false,
    del: false,
    viewAll: false,
    modifyAll: false
  };

  for (const p of objectPerms) {
    crud.create ||= !!p.PermissionsCreate;
    crud.read ||= !!p.PermissionsRead;
    crud.edit ||= !!p.PermissionsEdit;
    crud.del ||= !!p.PermissionsDelete;
    crud.viewAll ||= !!p.PermissionsViewAllRecords;
    crud.modifyAll ||= !!p.PermissionsModifyAllRecords;
  }

  // Describe-based effective check for current session user (if provided)
  if (objectDescribe) {
    crud.create ||= !!objectDescribe.createable;
    crud.read ||= !!objectDescribe.queryable || !!objectDescribe.retrieveable;
    crud.edit ||= !!objectDescribe.updateable;
    crud.del ||= !!objectDescribe.deletable;
  }

  findings.push({
    severity: crud.read ? "info" : "high",
    title: `${obj} CRUD`,
    detail: `C:${yn(crud.create)} R:${yn(crud.read)} U:${yn(crud.edit)} D:${yn(crud.del)} ViewAll:${yn(crud.viewAll)} ModifyAll:${yn(crud.modifyAll)}`
  });

  if (crud.modifyAll) {
    findings.push({
      severity: "medium",
      title: "Modify All",
      detail: "Modify All Records is powerful — confirm it is required (least privilege)."
    });
  }

  const sensitive = [];
  for (const fp of fieldPerms) {
    const name = fp.Field?.split(".")?.[1] || fp.Field;
    if (!fp.PermissionsRead) continue;
    if (/ssn|social|password|token|secret|bank|routing|dob|birth/i.test(name || "")) {
      sensitive.push(name);
    }
  }
  if (sensitive.length) {
    findings.push({
      severity: "high",
      title: "Sensitive field access",
      detail: `Readable sensitive-looking fields: ${sensitive.slice(0, 15).join(", ")}`
    });
  }

  if (objectDescribe?.fields) {
    const noAccess = objectDescribe.fields.filter((f) => f.permissionable && f.accessible === false).slice(0, 10);
    if (noAccess.length) {
      findings.push({
        severity: "info",
        title: "FLS (session user describe)",
        detail: `Examples not accessible: ${noAccess.map((f) => f.name).join(", ")}`
      });
    }
  }

  if (!objectPerms.length && !objectDescribe) {
    findings.push({
      severity: "medium",
      title: "Limited data",
      detail: "Could not load ObjectPermissions/describe. Ensure session is connected and API name is correct."
    });
  }

  const summary = `${obj} · Read ${yn(crud.read)} · Edit ${yn(crud.edit)} · ${assignments?.length || 0} assignment(s)`;
  return { summary, findings, crud };
}

function yn(v) {
  return v ? "Y" : "N";
}

export function buildPermissionQueries(usernameOrId, objectApiName) {
  const isId = /^[a-zA-Z0-9]{15,18}$/.test(usernameOrId);
  const userFilter = isId ? `Id = '${usernameOrId}'` : `Username = '${escapeSoql(usernameOrId)}'`;
  return {
    user: `SELECT Id, Name, Username, IsActive, ProfileId, Profile.Name FROM User WHERE ${userFilter} LIMIT 1`,
    assignments: `SELECT Id, PermissionSetId, PermissionSet.Name, PermissionSetGroupId, PermissionSetGroup.MasterLabel FROM PermissionSetAssignment WHERE AssigneeId = '{USER_ID}'`,
    objectPerms: `SELECT ParentId, SobjectType, PermissionsCreate, PermissionsRead, PermissionsEdit, PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords FROM ObjectPermissions WHERE SobjectType = '${escapeSoql(objectApiName)}' AND ParentId IN (SELECT PermissionSetId FROM PermissionSetAssignment WHERE AssigneeId = '{USER_ID}')`,
    fieldPerms: `SELECT Field, PermissionsRead, PermissionsEdit, SobjectType FROM FieldPermissions WHERE SobjectType = '${escapeSoql(objectApiName)}' AND ParentId IN (SELECT PermissionSetId FROM PermissionSetAssignment WHERE AssigneeId = '{USER_ID}') LIMIT 200`
  };
}

function escapeSoql(v) {
  return String(v).replace(/'/g, "\\'");
}
