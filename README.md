# JavaScript File Explorer

A school project made in less than a week!

### Analyze the size of your files and folders, just from a web browser!

**[View it online!](https://explorer.🦊💻.ws/)**

This site allows you to select a location on your device, and it will then start scanning all the files and compute their size with an easy to read interface!

- 🛡️ No data is being transmitted, it's all happening on-device!
- 📲 No need to install anything! Just open your browser! (But you can still install the app from your browser and use it even offline!)
- 🌐 Cross-platform! Tested on 🪟 Windows and 🍎 Mac, should also work on 🐧 Linux!

## ⚠️ Works best on Firefox
As of the date of writing this, Firefox has the best compatibility with this app. See the compatibility table below

| Feature                         | Firefox for desktop                                                           | Chrome & Chromium based browsers                                  |
|---------------------------------|-------------------------------------------------------------------|-------------------------------------------------------------------|
| Drag and dropping folders       | ✅ The fastest option                                              | ⚠️ Will not show the subfolders                                    |
| Importing files with the button | ⚠️ Slow for large folders                                          | ⚠️ Extremely slow for large folders                                |
| Displaying large lists          | ✅ Only slow on extremely large lists (100k+ elements in one list) | ⚠️ Slow, will sometimes not load the list and slow down the browser |

> 💡 Firefox for Android is not yet compatible with this app, due to [this Firefox bug](https://bugzilla.mozilla.org/show_bug.cgi?id=1973726)

## Run the app locally

If you want to run the app locally, just serve the HTML file and other files of the repository with a local server. You can use the included server file to do this in 2 easy steps :

1. Run the following in a terminal window at the root of this project

```ps1
. Start-Server.ps1
```

2. Do a CTRL+Click on the localhost link it gives you to open your browser, or directly go to `localhost:8080`!