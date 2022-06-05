import MWII from "../config.js";
import DiceMWII from "../dice.js";

export class ItemMWII extends Item {
    get hasAttack() {
        return this.data.type === "weapons";
    }

    get hasDamage() {
        return !!(this.data.data.damage);
    }

    get skillUsed() {
        if (this.data.type === "weapons") return this.data.data.skill;
        
        return null;
    }

    get isRanged() {
        return this.data.data.type !== "melee" || this.data.data.skill === 'throwing_weapons';
    }

    prepareData() {
        super.prepareData();

        const config = MWII;
        const labels = {};
        const itemData = this.data;
        const data = itemData.data;

        if (itemData.type === 'armor') {
            labels.energy = data.energy.value ? `Energy ${this._calculateArmorDamageAbsorption(data.energy)}` : "";
            labels.ballistic = data.ballistic.value ? `Ballistic ${this._calculateArmorDamageAbsorption(data.ballistic)}` : "";
            labels.melee = data.melee.value ? `Melee ${this._calculateArmorDamageAbsorption(data.melee)}` : "";
            labels.damage_capacity = data.damage_capacity.max ? `Damage Cap ${data.damage_capacity.max}` : "";
        }

        this.labels = labels;
    }


    sendToChat() {

    }

    static initializeSocketListeners() {
        game.mwii.socket.registerCallback('hitLocationConfirmed', 'local', this._onHitLocationConfirmed);
    }

    /**
     * Roll an attack for this weapon.
     * 
     * @param {JQuery.Event} event The triggering event
     * @returns {Promise<Roll>} Returns the roll object used to make the check
     */
    async rollAttack(event) {
        if (!this.hasAttack) {
            const message = game.i18n.format("MWII.Items.Errors.NotAWeapon", {item: this.data.name})
            ui.notifications.error(message);
            throw new Error(message);
        }

        const skillUsed = this.skillUsed;
        const isRanged = this.isRanged;

        if (!skillUsed) {
            ui.notifications.warn(game.i18n.format("MWII.Weapons.Errors.NoSkillUsed", {weapon: this.data.name}));
            return null;
        }

        return this.actor.rollSkillCheck(skillUsed, {event, isAttackRoll: true, isRanged, weapon: this.data.name});
    }

    async rollHitLocation(event) {
        const hitLocation = await DiceMWII.rollHitLocation(this.id, this.actor.id);
        await game.mwii.overlay.show({content: game.i18n.localize("MWII.HitLocation.WaitingForGM")});
        game.mwii.socket.sendMessageTo('gm', 'confirmHitLocation', hitLocation);
    }

    /**
     * Handle confirmation of the hit location roll.
     * 
     * @param {MWIIMessageData} message The message being handled
     */
    static _onHitLocationConfirmed(message) {
        const { payload } = message;

        if (!payload) return;

        const actor = game.actors.get(payload.actorId);
        const item = actor.items.get(payload.itemId);

        item.rollDamage(jQuery.Event('click'), payload);
    }

    async rollDamage(event, hitLocation = null) {
        if (!this.hasDamage) {
            const message = game.i18n.format("MWII.Weapons.Errors.NoDamage", {weapon: this.data.name});
            ui.notifications.error(message);
            throw new Error(message);
        }

        if (!hitLocation)
            hitLocation = await DiceMWII.rollHitLocation();

        const data = this.actor.getRollData();
        data.hitLocation = hitLocation;
        data.damageType = this.data.data.damageType;
        data.lethality = this.data.data.lethality;

        const title = game.i18n.format("MWII.Rolls.Titles.Damage", {weapon: this.data.name});

        return await DiceMWII.rollDamage({
            event,
            data,
            formula: this.data.data.damage,
            title
        });
    }

    _calculateArmorDamageAbsorption(damageType) {
        const percentages = {0: "None", [1/2]: "1/2", [1/3]: "1/3", [1/4]: "1/4",[2/3]: "2/3",[3/4]: "3/4", 1: "All"};

        return damageType.type === "percentage" ? percentages[damageType.value] : `${damageType.value} pt(s)`;
    }
}