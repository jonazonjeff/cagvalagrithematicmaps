Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
updater = fso.BuildPath(scriptDir, "RSBSAUpdater.ps1")

command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & updater & Chr(34)
shell.Run command, 1, False
