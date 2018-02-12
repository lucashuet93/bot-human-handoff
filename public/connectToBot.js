var params = {};
location
    .search
    .substring(1)
    .split("&")
    .forEach(function (pair) {
        var p = pair.split("=");
        params[p[0]] = decodeURIComponent(p[1]);
    });

var botConnection = new BotChat.DirectLine({
    secret: '7EBpA_iGoLg.cwA.Q10.5XzKmnhwwImvFd8IHLlutUonX9-pvjWpLcAgWtQJAPo'
});

var bot = {
    id: '3e881008-0b5b-49c1-b779-f78e7306d845',
    name: 'TestBotLucasDemo'
};

var logon_form = document.getElementById('logon-form');
var user_id = document.getElementById('user-id')

logon_form.onsubmit = e => {
    e.preventDefault();
    logon_form.style.display = 'none';

    var user = {
        id: user_id.value + Math.floor(Math.random() * 1000) + 1  ,
        name: 'Agent'
    }
    BotChat.App({
        botConnection: botConnection,
        user: user,
        bot: bot,
    }, document.getElementById("BotChatGoesHere"));
}