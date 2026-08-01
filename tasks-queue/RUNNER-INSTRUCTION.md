There is a folder at tasks/ containing one markdown file per task, named with a number prefix (07-..., 08-..., etc). There is also an empty tasks/done/ folder.

Run this loop:

1. List tasks/ and pick the file with the lowest number.
2. Read only that one file. Do not read the others yet.
3. If the file contains a line starting with "[QUESTION FOR USER:", stop right there, ask me that exact question, and wait for my reply. Once I answer, continue executing the rest of that same file with my answer applied. Do not move to the next file until this one is fully done.
4. Execute everything in the file.
5. Rebuild (npm run build in both client and server). Run lint in client if the task touched client code.
6. If the build or lint fails, stop and report the failure — do not move the file, do not continue to the next task.
7. If it's clean, move that file from tasks/ into tasks/done/, then go back to step 1 and repeat automatically — do not wait for me to say continue.
8. Stop only when tasks/ is empty (aside from the done/ folder), or when you hit a question, or when something fails. When tasks/ is empty, give me one summary of everything done across all files.

Start now with whatever file is currently lowest-numbered in tasks/.
