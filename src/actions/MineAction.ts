class MineAction extends HarvestAction {
    public actor;
    public target;
    public action_name = 'Mine';

    constructor(actor) {
        super(actor);
    }

    getTargets() {
        return this.actor.room.find(FIND_MINERALS);
    }

}
CreepActions['Mine'] = MineAction;
