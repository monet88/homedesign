# Issue Tracker

- **Tracker:** Local markdown (solo project, no GitHub remote)
- **Location:** .scratch/wayfinder/ — map là map-homedesign-clone.md (label \wayfinder:map\), tickets là child issues trong \	ickets/\
- **Blocking:** Body convention \Blocked by: <ticket file>\ (tracker không có native dependency)
- **Frontier query:** \Get-ChildItem .scratch/wayfinder/tickets/*.md | Where-Object { (Get-Content \ | Select-String \"status: open\") -and -not (blocked) }\
- **PRs as request surface:** off
