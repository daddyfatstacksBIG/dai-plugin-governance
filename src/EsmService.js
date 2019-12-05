import { PrivateService } from "@makerdao/services-core";

import { END, ESM, MKR } from "./utils/constants";
import { getCurrency } from "./utils/helpers";

export default class EsmService extends PrivateService {
  constructor(name = "esm") {
    super(name, ["smartContract", "web3", "token", "allowance"]);
  }

  async thresholdAmount() {
    const min = await this._esmContract().min();
    return getCurrency(min, MKR).shiftedBy(-18);
  }

  async fired() {
    const _fired = await this._esmContract().fired();
    return _fired.eq(1);
  }

  async emergencyShutdownActive() {
    const active = await this._endContract().live();
    return active.eq(0);
  }

  async canFire() {
    const [fired, live] = await Promise.all([
      this.fired(),
      this.emergencyShutdownActive()
    ]);
    return !fired && !live;
  }

  async getTotalStaked() {
    const total = await this._esmContract().Sum();
    return getCurrency(total, MKR).shiftedBy(-18);
  }

  async getTotalStakedByAddress(address = false) {
    if (!address) {
      address = this.get("web3").currentAddress();
    }
    const total = await this._esmContract().sum(address);
    return getCurrency(total, MKR).shiftedBy(-18);
  }

  async stake(amount, skipChecks = false) {
    const mkrAmount = getCurrency(amount, MKR);
    if (!skipChecks) {
      const [fired, mkrBalance] = await Promise.all([
        this.fired(),
        this.get("token")
          .getToken(MKR)
          .balance()
      ]);
      if (fired) {
        throw new Error("cannot join when emergency shutdown has been fired");
      }
      if (mkrBalance.lt(mkrAmount)) {
        throw new Error("amount to join is greater than the user balance");
      }
    }
    return this._esmContract().join(mkrAmount.toFixed("wei"));
  }

  async triggerEmergencyShutdown(skipChecks = false) {
    if (!skipChecks) {
      const [thresholdAmount, totalStaked, canFire] = await Promise.all([
        this.thresholdAmount(),
        this.getTotalStaked(),
        this.canFire()
      ]);
      if (totalStaked.lt(thresholdAmount)) {
        throw new Error(
          "total amount of staked MKR has not reached the required threshold"
        );
      }
      if (!canFire) {
        throw new Error("emergency shutdown has already been initiated");
      }
    }
    return this._esmContract().fire();
  }

  _esmContract() {
    return this.get("smartContract").getContractByName(ESM);
  }

  _endContract() {
    return this.get("smartContract").getContractByName(END);
  }
}
