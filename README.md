# Steam Card Farmer

## Requires Node.js version 0.12 or greater, or io.js version 1.0 or greater.

Designed for advanced users.

# Installation

- Install [Node.js](https://nodejs.org) (v0.12.0 or later) or [io.js](https://iojs.org)
- Run `sudo npm install -g steam-card-farmer` (Linux) or `npm install -g steam-card-farmer` from an [elevated command prompt](http://pcsupport.about.com/od/commandlinereference/f/elevated-command-prompt.htm) (Windows).

# Usage

On the command line, just type `steamcardfarmer`. Optionally include your username and password as arguments, as such: `steamcardfarmer steamusername steampassword`.

If not provided on the command line, it'll prompt you for your Steam username and password. Just because it invariably ends up with someone asking about it, **when you enter your password, no characters will show up**. Don't worry, you're typing.

If you have games with remaining drops which have less than 2 hours of playtime, the app will first mass-idle all of them up to 2 hours. Then it will start switching through them to get card drops. This is because it's now impossible to get card drops before your first 2 hours of gameplay.

If you have purchased a game in the past 14 days, **idling it will waive your right to a refund on Steam**. If you have apps which were purchased less than 14 days ago, have remaining drops, have less than 2 hours of playtime, and weren't redeemed from a CD key, complimentary, or a gift, the app will first prompt you which games you'd like to idle.

It'll automatically switch through all games you have with remaining card drops (it checks every 20 minutes or immediately when a new item is received). One could theoretically mass-idle all games at once, but it takes just as long and this way doesn't rack up unnecessary fake playtime.

If you have more than 250 games/badges, **this will only idle your [first page](https://steamcommunity.com/my/badges)**. Because I made this application only for myself and shared it just because, I have no plans to add things that I will not use. The best way to get me to support multiple pages is to [buy me games](https://steamcommunity.com/id/DoctorMcKay). Pull requests welcome.

## License

Released under [the MIT license](http://opensource.org/licenses/MIT).