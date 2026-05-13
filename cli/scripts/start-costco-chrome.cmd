@echo off
rem Launches a persistent Chrome debug profile for Costco cart transfer.
rem Log in to instacart.com AND sameday.costco.com once; cookies persist.

set PROFILE=%LOCALAPPDATA%\ChromeDebug\Costco
if not exist "%PROFILE%" mkdir "%PROFILE%"

"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="%PROFILE%" ^
  --disable-extensions ^
  https://www.instacart.com/store/costco https://sameday.costco.com/store
