' ============================================================================
'  AI LEARNING ASSISTANT — SILENT LAUNCHER (for Task Scheduler)
' ============================================================================
'  This VBScript launches auto-start.bat in a minimized window.
'  Use this as the program in Windows Task Scheduler so the console
'  doesn't pop up full-screen on every login.
'
'  To use:
'    1. Open Task Scheduler (Win+R → taskschd.msc)
'    2. Create Basic Task → Trigger: "When I log on"
'    3. Action: Start a program → Browse to this .vbs file
'    4. Done!
' ============================================================================

Dim WshShell
Set WshShell = CreateObject("WScript.Shell")

' Get the directory where this .vbs file lives
Dim scriptDir
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))

' Launch auto-start.bat minimized (1 = minimized window)
WshShell.Run """" & scriptDir & "auto-start.bat""", 1, False

Set WshShell = Nothing
