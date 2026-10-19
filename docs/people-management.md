# Student and teacher management

Implemented 2026-10-17. No new migration or dependency installation is required.
Restart `bun run dev` if your server has not automatically reloaded.

## Permissions and responses

Admins and managers can create and update student/teacher records. The route fixes
the account role; caller-supplied roles, IDs, and unexpected fields are rejected.
User, credential account, profile, and role record are created in one transaction.
Passwords are hashed with Better Auth and never returned. Duplicate emails return 409.
New-account responses contain `id` (student/teacher ID), `profileId`, and `role`.

Students can read only their own student record. Teachers can read students linked
to their enrollments, plus their own teacher record. Staff can read all records.
Student detail lookups outside the caller's scope return 404. Nonstaff responses
omit phone/email; no response includes credential accounts, hashes, or session tokens.
Lists support `limit` and `offset` as documented in README.

PATCH accepts firstName, lastName, and phone, plus:
- Students: englishLevel, learningGoal, status (`active` or `inactive`).
- Teachers: specialization.

Student learning fields and phone accept null to clear them. Name updates also
update the Better Auth user display name in the same transaction. Email, password,
role, and ownership cannot be changed through these endpoints. Empty PATCH requests
are rejected. `inactive` prevents new enrollments; it does not suspend login or
remove existing enrollments. Account suspension is a separate future feature.

## Try it from PowerShell

Use a second PowerShell terminal while the API runs. First sign in as admin/manager
and retain `$schoolSession` (if you already have a valid session, skip this block):

```powershell
$credential = Get-Credential -Message 'Admin email and password'
$loginBody = @{ email = $credential.UserName; password = $credential.GetNetworkCredential().Password } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/sign-in/email' -Method Post -ContentType 'application/json' -Headers @{ Origin = 'http://localhost:8081' } -Body $loginBody -SessionVariable schoolSession | Out-Null
Remove-Variable credential, loginBody
```

Create a teacher (edit the name and specialization before running):

```powershell
$credential = Get-Credential -Message 'NEW teacher email and password (12+ characters)'
$body = @{
  email = $credential.UserName
  password = $credential.GetNetworkCredential().Password
  firstName = 'Teacher'
  lastName = 'Example'
  specialization = 'English'
} | ConvertTo-Json
$teacher = Invoke-RestMethod -Uri 'http://localhost:3000/api/teachers' -Method Post -ContentType 'application/json' -WebSession $schoolSession -Body $body
Remove-Variable credential, body
$teacher
```

Create a student:

```powershell
$credential = Get-Credential -Message 'NEW student email and password (12+ characters)'
$body = @{
  email = $credential.UserName
  password = $credential.GetNetworkCredential().Password
  firstName = 'Student'
  lastName = 'Example'
} | ConvertTo-Json
$student = Invoke-RestMethod -Uri 'http://localhost:3000/api/students' -Method Post -ContentType 'application/json' -WebSession $schoolSession -Body $body
Remove-Variable credential, body
$student
```

List students and teachers:

```powershell
Invoke-RestMethod -Uri 'http://localhost:3000/api/students' -WebSession $schoolSession
Invoke-RestMethod -Uri 'http://localhost:3000/api/teachers' -WebSession $schoolSession
```

Update the student's learning details:

```powershell
$body = @{ englishLevel = 'B1'; learningGoal = 'Improve conversation' } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/students/$($student.id)" -Method Patch -ContentType 'application/json' -WebSession $schoolSession -Body $body
```

Create a course and enroll that student using the returned IDs:

```powershell
$body = @{ name = 'General English'; category = 'English'; price = '50.00'; teacherId = $teacher.id } | ConvertTo-Json
$course = Invoke-RestMethod -Uri 'http://localhost:3000/api/courses' -Method Post -ContentType 'application/json' -WebSession $schoolSession -Body $body
$body = @{ studentId = $student.id; courseId = $course.id } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3000/api/enrollments' -Method Post -ContentType 'application/json' -WebSession $schoolSession -Body $body
```

These commands create real records in your configured development database. Choose
the intended names and email addresses. No invitation email is sent yet. If requests
return 401, repeat the administrator login block to refresh the session.
