class ClaimAction extends ReserveAction {
    public actor;
    public target;
    public action_name = 'Claim';
    protected min_ticks = 15000;

    constructor(actor) {
        super(actor);
    }

    perform() {
        let controller_is_mine = (<Controller>this.target).owner && (<Controller>this.target).owner.username == Globals.USERNAME;
        if (controller_is_mine || (<Controller>this.target).ticksToDowngrade > this.min_ticks) {
            return false;
        } else {
            // let action = this.actor.claimController(this.target);
            let action = this.actor.claimController(this.target);
            // console.log('claiming', action);
            if (action == ERR_NOT_IN_RANGE) {
                this.move();
            }else if (action == ERR_GCL_NOT_ENOUGH) {
                action = this.actor.reserveController(this.target);
                if (action == ERR_NOT_IN_RANGE) {
                    // this.move(); //should already be handled
                }else if (action != 0) {
                    console.log('reserveController error:', action);
                    return false;
                }
                super.perform();
            } else if (action != 0) {
                console.log('claimController error:', action);
                return false;
            }
            return true;
        }
    }

}
CreepActions['Claim'] = ClaimAction;
