//Requires
const modulename = 'WebServer:updateChecker';
const got = require('../extras/got');
const semver = require('semver');
const { dir, log, logOk, logWarn, logError } = require('../extras/console')(modulename);

//Helpers
const now = () => { return Math.round(Date.now() / 1000); };

/*
    TODO:
    Create an page with the changelog, that queries for the following endpoint and caches it for 15 minutes:
        https://changelogs-live.fivem.net/api/changelog/versions/2385/2375?tag=server
    Maybe even grab the data from commits:
        https://changelogs-live.fivem.net/api/changelog/versions/5562
    Other relevant apis:
        https://changelogs-live.fivem.net/api/changelog/versions/win32/server? (the one being used below)
        https://changelogs-live.fivem.net/api/changelog/versions
        https://api.github.com/repos/tabarra/txAdmin/releases (changelog in [].body)

    NOTE: old logic
    if == recommended, you're fine
    if > recommended && < optional, pls update to optional
    if == optional, you're fine
    if > optional && < latest, pls update to latest
    if == latest, duh
    if < critical, BIG WARNING
*/

module.exports = async () => {
    let apiResponse;
    try {
        //perform request - cache busting every ~1.4h
        const osTypeApiUrl = (GlobalData.osType == 'windows') ? 'win32' : 'linux';
        const cacheBuster = Math.floor(now() / 5e3);
        const reqUrl = `https://changelogs-live.fivem.net/api/changelog/versions/${osTypeApiUrl}/server?${cacheBuster}`;
        apiResponse = await got.get(reqUrl).json();

        //validate response
        if (!apiResponse) throw new Error('request failed');
        const requiredFields = [
            'recommended',
            'recommended_download',
            'recommended_txadmin',
            'optional',
            'optional_download',
            'optional_txadmin',
            'latest',
            'latest_download',
            'latest_txadmin',
            'critical',
            'critical_download',
            'critical_txadmin',
        ];
        const missing = requiredFields.find((x) => !apiResponse.hasOwnProperty(x));
        if (missing) {
            throw new Error(`expected prop ${missing} not found in api response.`);
        }
    } catch (error) {
        if (GlobalData.verbose) logWarn(`Failed to retrieve FXServer/txAdmin update data with error: ${error.message}`);
        if (globals.databus.updateChecker === null) globals.databus.updateChecker = false;
        return;
    }

    //Checking txAdmin version
    let txOutput = false;
    try {
        const semverDiff = semver.diff(GlobalData.txAdminVersion, apiResponse.latest_txadmin);
        if (!GlobalData.txAdminVersion.includes('-') && semverDiff) {
            logError('This version of txAdmin is outdated.');
            logError('Please update as soon as possible.');
            logError('For more information: https://discord.gg/uAmsGa2');
            txOutput = {
                semverDiff,
                latest: apiResponse.latest_txadmin,
                color: (semverDiff === 'patch') ? 'warning' : 'danger',
            };
        }
    } catch (error) {
        logWarn('Error checking for txAdmin updates. Enable verbosity for more information.');
        if (GlobalData.verbose) dir(error);
    }

    //Checking FXServer version
    //FIXME: logic copied from dashboard webroute, adapt to new thing
    let fxsOutput = false;
    try {
        if (GlobalData.fxServerVersion < apiResponse.critical) {
            fxsOutput = {
                color: 'danger',
                message: 'A critical update is available for FXServer, you should update now.',
            };
            if (apiResponse.critical > apiResponse.recommended) {
                fxsOutput.subtext = `critical update ${GlobalData.fxServerVersion} ➤ ${apiResponse.critical}`;
                fxsOutput.artifactsLink = apiResponse.critical_download;
            } else {
                fxsOutput.subtext = `recommended update ${GlobalData.fxServerVersion} ➤ ${apiResponse.recommended}`;
                fxsOutput.artifactsLink = apiResponse.recommended_download;
            }
        } else if (GlobalData.fxServerVersion < apiResponse.recommended) {
            fxsOutput = {
                color: 'warning',
                message: 'A recommended update is available for FXServer, you should update.',
                subtext: `recommended update ${GlobalData.fxServerVersion} ➤ ${apiResponse.recommended}`,
                artifactsLink: apiResponse.recommended_download,
            };
        } else if (GlobalData.fxServerVersion < apiResponse.optional) {
            fxsOutput = {
                color: 'info',
                message: 'An optional update is available for FXServer.',
                subtext: `optional update ${GlobalData.fxServerVersion} ➤ ${apiResponse.optional}`,
                artifactsLink: apiResponse.optional_download,
            };
        }
    } catch (error) {
        logWarn('Error checking for FXServer updates. Enable verbosity for more information.');
        if (GlobalData.verbose) dir(error);
    }

    //Output
    globals.databus.updateChecker = {
        txadmin: txOutput,
        fxserver: fxsOutput,
    };
};
