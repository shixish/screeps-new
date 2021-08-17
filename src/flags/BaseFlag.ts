class BaseFlag { //Abstract class
    public flag_name = 'Unknown';
	public flag: Flag;

    constructor(flag: Flag) {
        this.flag = flag;
    }

    getMaxCreepCount() {
        return {};
    }
}
